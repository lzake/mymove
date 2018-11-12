package internalapi

import (
	"context"
	"github.com/go-openapi/runtime/middleware"
	"github.com/gobuffalo/validate"
	"github.com/gofrs/uuid"

	"github.com/honeycombio/beeline-go"
	"github.com/transcom/mymove/pkg/auth"
	servicememberop "github.com/transcom/mymove/pkg/gen/internalapi/internaloperations/service_members"
	"github.com/transcom/mymove/pkg/gen/internalmessages"
	"github.com/transcom/mymove/pkg/handlers"
	"github.com/transcom/mymove/pkg/models"
	"github.com/transcom/mymove/pkg/storage"
	"go.uber.org/zap"
	"reflect"
)

func payloadForServiceMemberModel(storer storage.FileStorer, serviceMember models.ServiceMember) *internalmessages.ServiceMemberPayload {
	var dutyStationPayload *internalmessages.DutyStationPayload
	dutyStationPayload = payloadForDutyStationModel(serviceMember.DutyStation)
	orders := make([]*internalmessages.Orders, len(serviceMember.Orders))
	for i, order := range serviceMember.Orders {
		orderPayload, _ := payloadForOrdersModel(storer, order)
		orders[i] = orderPayload
	}

	contactPayloads := make(internalmessages.IndexServiceMemberBackupContactsPayload, len(serviceMember.BackupContacts))
	for i, contact := range serviceMember.BackupContacts {
		contactPayload := payloadForBackupContactModel(contact)
		contactPayloads[i] = &contactPayload
	}

	serviceMemberPayload := internalmessages.ServiceMemberPayload{
		ID:                      handlers.FmtUUID(serviceMember.ID),
		CreatedAt:               handlers.FmtDateTime(serviceMember.CreatedAt),
		UpdatedAt:               handlers.FmtDateTime(serviceMember.UpdatedAt),
		UserID:                  handlers.FmtUUID(serviceMember.UserID),
		Edipi:                   serviceMember.Edipi,
		Orders:                  orders,
		Affiliation:             (*internalmessages.Affiliation)(serviceMember.Affiliation),
		Rank:                    (*internalmessages.ServiceMemberRank)(serviceMember.Rank),
		FirstName:               serviceMember.FirstName,
		MiddleName:              serviceMember.MiddleName,
		LastName:                serviceMember.LastName,
		Suffix:                  serviceMember.Suffix,
		Telephone:               serviceMember.Telephone,
		SecondaryTelephone:      serviceMember.SecondaryTelephone,
		PhoneIsPreferred:        serviceMember.PhoneIsPreferred,
		PersonalEmail:           serviceMember.PersonalEmail,
		TextMessageIsPreferred:  serviceMember.TextMessageIsPreferred,
		EmailIsPreferred:        serviceMember.EmailIsPreferred,
		ResidentialAddress:      payloadForAddressModel(serviceMember.ResidentialAddress),
		BackupMailingAddress:    payloadForAddressModel(serviceMember.BackupMailingAddress),
		BackupContacts:          contactPayloads,
		HasSocialSecurityNumber: handlers.FmtBool(serviceMember.SocialSecurityNumberID != nil),
		IsProfileComplete:       handlers.FmtBool(serviceMember.IsProfileComplete()),
		CurrentStation:          dutyStationPayload,
	}
	return &serviceMemberPayload
}

// CreateServiceMemberHandler creates a new service member via POST /serviceMember
type CreateServiceMemberHandler struct {
	handlers.HandlerContext
}

// Handle ... creates a new ServiceMember from a request payload
func (h CreateServiceMemberHandler) Handle(params servicememberop.CreateServiceMemberParams) middleware.Responder {

	ctx := params.HTTPRequest.Context()
	ctx, span := beeline.StartSpan(ctx, reflect.TypeOf(h).Name())
	defer span.Send()

	residentialAddress := addressModelFromPayload(params.CreateServiceMemberPayload.ResidentialAddress)
	backupMailingAddress := addressModelFromPayload(params.CreateServiceMemberPayload.BackupMailingAddress)

	ssnString := params.CreateServiceMemberPayload.SocialSecurityNumber
	var ssn *models.SocialSecurityNumber
	verrs := validate.NewErrors()
	if ssnString != nil {
		var err error
		ssn, verrs, err = models.BuildSocialSecurityNumber(ssnString.String())
		if err != nil {
			h.HoneyZapLogger().TraceError(ctx, "invalid social security number")
			return handlers.ResponseForError(h.Logger(), err)
		}
		// if there are any validation errors, they will get rolled up with the rest of them.
	}

	var stationID *uuid.UUID
	var station models.DutyStation
	if params.CreateServiceMemberPayload.CurrentStationID != nil {
		id, err := uuid.FromString(params.CreateServiceMemberPayload.CurrentStationID.String())
		if err != nil {
			h.HoneyZapLogger().TraceError(ctx, "invalid current station id")
			return handlers.ResponseForError(h.Logger(), err)
		}
		s, err := models.FetchDutyStation(h.DB(), id)
		if err != nil {
			h.HoneyZapLogger().TraceError(ctx, "could not fetch duty station")
			return handlers.ResponseForError(h.Logger(), err)
		}
		stationID = &id
		station = s
	}

	// User should always be populated by middleware
	session := auth.SessionFromRequestContext(params.HTTPRequest)

	// Create a new serviceMember for an authenticated user
	newServiceMember := models.ServiceMember{
		UserID:                 session.UserID,
		Edipi:                  params.CreateServiceMemberPayload.Edipi,
		Affiliation:            (*models.ServiceMemberAffiliation)(params.CreateServiceMemberPayload.Affiliation),
		Rank:                   (*models.ServiceMemberRank)(params.CreateServiceMemberPayload.Rank),
		FirstName:              params.CreateServiceMemberPayload.FirstName,
		MiddleName:             params.CreateServiceMemberPayload.MiddleName,
		LastName:               params.CreateServiceMemberPayload.LastName,
		Suffix:                 params.CreateServiceMemberPayload.Suffix,
		Telephone:              params.CreateServiceMemberPayload.Telephone,
		SecondaryTelephone:     params.CreateServiceMemberPayload.SecondaryTelephone,
		PersonalEmail:          params.CreateServiceMemberPayload.PersonalEmail,
		PhoneIsPreferred:       params.CreateServiceMemberPayload.PhoneIsPreferred,
		TextMessageIsPreferred: params.CreateServiceMemberPayload.TextMessageIsPreferred,
		EmailIsPreferred:       params.CreateServiceMemberPayload.EmailIsPreferred,
		ResidentialAddress:     residentialAddress,
		BackupMailingAddress:   backupMailingAddress,
		SocialSecurityNumber:   ssn,
		DutyStation:            station,
		DutyStationID:          stationID,
	}
	smVerrs, err := models.SaveServiceMember(h.DB(), &newServiceMember)
	verrs.Append(smVerrs)
	if verrs.HasAny() || err != nil {
		h.HoneyZapLogger().TraceInfo(ctx, "error when creating new service member")
		return handlers.ResponseForVErrors(h.Logger(), verrs, err)
	}
	// Update session info
	session.ServiceMemberID = newServiceMember.ID

	h.HoneyZapLogger().TraceInfo(ctx, "created new service member",
		zap.String("service_member_id", newServiceMember.ID.String()))

	if newServiceMember.FirstName != nil {
		session.FirstName = *(newServiceMember.FirstName)
	}
	if newServiceMember.MiddleName != nil {
		session.Middle = *(newServiceMember.MiddleName)
	}
	if newServiceMember.LastName != nil {
		session.LastName = *(newServiceMember.LastName)
	}
	// And return
	serviceMemberPayload := payloadForServiceMemberModel(h.FileStorer(), newServiceMember)
	responder := servicememberop.NewCreateServiceMemberCreated().WithPayload(serviceMemberPayload)
	return handlers.NewCookieUpdateResponder(params.HTTPRequest, h.CookieSecret(), h.NoSessionTimeout(), h.Logger(), responder)
}

// ShowServiceMemberHandler returns a serviceMember for a user and service member ID
type ShowServiceMemberHandler struct {
	handlers.HandlerContext
}

// Handle retrieves a service member in the system belonging to the logged in user given service member ID
func (h ShowServiceMemberHandler) Handle(params servicememberop.ShowServiceMemberParams) middleware.Responder {

	ctx := params.HTTPRequest.Context()
	ctx, span := beeline.StartSpan(ctx, reflect.TypeOf(h).Name())
	defer span.Send()

	session := auth.SessionFromRequestContext(params.HTTPRequest)

	serviceMemberID, _ := uuid.FromString(params.ServiceMemberID.String())

	span.AddField("service_member_id", serviceMemberID.String())

	serviceMember, err := models.FetchServiceMemberForUser(h.DB(), session, serviceMemberID)
	if err != nil {
		h.HoneyZapLogger().TraceError(ctx, "Failed to fetch service member",
			zap.String("service_member_id", serviceMemberID.String()))
		return handlers.ResponseForError(h.Logger(), err)
	}

	serviceMemberPayload := payloadForServiceMemberModel(h.FileStorer(), serviceMember)
	return servicememberop.NewShowServiceMemberOK().WithPayload(serviceMemberPayload)
}

// PatchServiceMemberHandler patches a serviceMember via PATCH /serviceMembers/{serviceMemberId}
type PatchServiceMemberHandler struct {
	handlers.HandlerContext
}

// Handle ... patches a new ServiceMember from a request payload
func (h PatchServiceMemberHandler) Handle(params servicememberop.PatchServiceMemberParams) middleware.Responder {

	ctx := params.HTTPRequest.Context()
	ctx, span := beeline.StartSpan(ctx, reflect.TypeOf(h).Name())
	defer span.Send()

	session := auth.SessionFromRequestContext(params.HTTPRequest)

	serviceMemberID, _ := uuid.FromString(params.ServiceMemberID.String())

	span.AddField("service_member_id", serviceMemberID.String())

	serviceMember, err := models.FetchServiceMemberForUser(h.DB(), session, serviceMemberID)
	if err != nil {
		h.HoneyZapLogger().TraceError(ctx, "error fetching service member",
			zap.String("service_member_id", params.ServiceMemberID.String()))
		return handlers.ResponseForError(h.Logger(), err)
	}

	payload := params.PatchServiceMemberPayload
	if verrs, err := h.patchServiceMemberWithPayload(ctx, &serviceMember, payload); verrs.HasAny() || err != nil {
		h.HoneyZapLogger().TraceError(ctx, "error patching service member",
			zap.String("service_member_id", serviceMember.ID.String()))
		return handlers.ResponseForVErrors(h.Logger(), verrs, err)
	}
	if verrs, err := models.SaveServiceMember(h.DB(), &serviceMember); verrs.HasAny() || err != nil {
		h.HoneyZapLogger().TraceError(ctx, "error saving service member",
			zap.String("service_member_id", serviceMember.ID.String()))
		return handlers.ResponseForVErrors(h.Logger(), verrs, err)
	}

	serviceMemberPayload := payloadForServiceMemberModel(h.FileStorer(), serviceMember)
	return servicememberop.NewPatchServiceMemberOK().WithPayload(serviceMemberPayload)
}

func (h PatchServiceMemberHandler) patchServiceMemberWithPayload(ctx context.Context, serviceMember *models.ServiceMember, payload *internalmessages.PatchServiceMemberPayload) (*validate.Errors, error) {

	ctx, span := beeline.StartSpan(ctx, "patchServiceMemberWithPayload")
	defer span.Send()

	if payload.Edipi != nil {
		serviceMember.Edipi = payload.Edipi
	}
	if payload.Affiliation != nil {
		serviceMember.Affiliation = (*models.ServiceMemberAffiliation)(payload.Affiliation)
	}
	if payload.Rank != nil {
		serviceMember.Rank = (*models.ServiceMemberRank)(payload.Rank)
	}
	if payload.FirstName != nil {
		serviceMember.FirstName = payload.FirstName
	}
	if payload.MiddleName != nil {
		serviceMember.MiddleName = payload.MiddleName
	}
	if payload.LastName != nil {
		serviceMember.LastName = payload.LastName
	}
	if payload.Suffix != nil {
		serviceMember.Suffix = payload.Suffix
	}
	if payload.Telephone != nil {
		serviceMember.Telephone = payload.Telephone
	}
	if payload.SecondaryTelephone != nil {
		serviceMember.SecondaryTelephone = payload.SecondaryTelephone
	}
	if payload.PersonalEmail != nil {
		serviceMember.PersonalEmail = payload.PersonalEmail
	}
	if payload.PhoneIsPreferred != nil {
		serviceMember.PhoneIsPreferred = payload.PhoneIsPreferred
	}
	if payload.TextMessageIsPreferred != nil {
		serviceMember.TextMessageIsPreferred = payload.TextMessageIsPreferred
	}
	if payload.EmailIsPreferred != nil {
		serviceMember.EmailIsPreferred = payload.EmailIsPreferred
	}
	if payload.CurrentStationID != nil {
		stationID, err := uuid.FromString(payload.CurrentStationID.String())
		if err != nil {
			return validate.NewErrors(), err
		}
		// Fetch the model partially as a validation on the ID
		station, err := models.FetchDutyStation(h.DB(), stationID)
		if err != nil {
			return validate.NewErrors(), err
		}
		serviceMember.DutyStation = station
		serviceMember.DutyStationID = &stationID
	}
	if payload.SocialSecurityNumber != nil {
		if serviceMember.SocialSecurityNumber == nil {
			newSsn := models.SocialSecurityNumber{}
			serviceMember.SocialSecurityNumber = &newSsn
		}

		if verrs, err := serviceMember.SocialSecurityNumber.SetEncryptedHash(payload.SocialSecurityNumber.String()); verrs.HasAny() || err != nil {
			return verrs, err
		}
	}
	if payload.ResidentialAddress != nil {
		if serviceMember.ResidentialAddress == nil {
			serviceMember.ResidentialAddress = addressModelFromPayload(payload.ResidentialAddress)
		} else {
			updateAddressWithPayload(serviceMember.ResidentialAddress, payload.ResidentialAddress)
		}
	}
	if payload.BackupMailingAddress != nil {
		if serviceMember.BackupMailingAddress == nil {
			serviceMember.BackupMailingAddress = addressModelFromPayload(payload.BackupMailingAddress)
		} else {
			updateAddressWithPayload(serviceMember.BackupMailingAddress, payload.BackupMailingAddress)
		}
	}

	return validate.NewErrors(), nil
}

// ShowServiceMemberOrdersHandler returns latest orders for a serviceMember
type ShowServiceMemberOrdersHandler struct {
	handlers.HandlerContext
}

// Handle retrieves orders for a service member
func (h ShowServiceMemberOrdersHandler) Handle(params servicememberop.ShowServiceMemberOrdersParams) middleware.Responder {

	ctx := params.HTTPRequest.Context()
	ctx, span := beeline.StartSpan(ctx, reflect.TypeOf(h).Name())
	defer span.Send()

	session := auth.SessionFromRequestContext(params.HTTPRequest)

	serviceMemberID, _ := uuid.FromString(params.ServiceMemberID.String())
	serviceMember, err := models.FetchServiceMemberForUser(h.DB(), session, serviceMemberID)
	if err != nil {
		h.HoneyZapLogger().TraceError(ctx, "error fetching service member",
			zap.String("service_member_id", params.ServiceMemberID.String()))
		return handlers.ResponseForError(h.Logger(), err)
	}

	order, err := serviceMember.FetchLatestOrder(h.DB())
	if err != nil {
		h.HoneyZapLogger().TraceError(ctx, "error fetching latest order",
			zap.String("service_member_id", params.ServiceMemberID.String()))
		return handlers.ResponseForError(h.Logger(), err)
	}

	orderPayload, err := payloadForOrdersModel(h.FileStorer(), order)
	if err != nil {
		return handlers.ResponseForError(h.Logger(), err)
	}
	return servicememberop.NewShowServiceMemberOrdersOK().WithPayload(orderPayload)
}
