import React, { Component } from 'react';
import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import { Redirect } from 'react-router-dom';
import { get } from 'lodash';
import { NavLink, Link } from 'react-router-dom';
import { reduxForm } from 'redux-form';
import faPlusCircle from '@fortawesome/fontawesome-free-solid/faPlusCircle';
import { titleCase } from 'shared/constants.js';

import LoadingPlaceholder from 'shared/LoadingPlaceholder';

import Alert from 'shared/Alert';
import DocumentList from 'shared/DocumentViewer/DocumentList';
import { withContext } from 'shared/AppContext';
import ConfirmWithReasonButton from 'shared/ConfirmWithReasonButton';
import { SwaggerField } from 'shared/JsonSchemaForm/JsonSchemaField';
import {
  getAllShipmentDocuments,
  selectShipmentDocuments,
  getShipmentDocumentsLabel,
  generateGBL,
} from 'shared/Entities/modules/shipmentDocuments';
import {
  getAllTariff400ngItems,
  selectTariff400ngItems,
  getTariff400ngItemsLabel,
} from 'shared/Entities/modules/tariff400ngItems';
import {
  getAllShipmentLineItems,
  selectSortedShipmentLineItems,
  getShipmentLineItemsLabel,
} from 'shared/Entities/modules/shipmentLineItems';

import FontAwesomeIcon from '@fortawesome/react-fontawesome';
import faPhone from '@fortawesome/fontawesome-free-solid/faPhone';
import faComments from '@fortawesome/fontawesome-free-solid/faComments';
import faEmail from '@fortawesome/fontawesome-free-solid/faEnvelope';
import faExternalLinkAlt from '@fortawesome/fontawesome-free-solid/faExternalLinkAlt';
import {
  loadShipmentDependencies,
  patchShipment,
  acceptShipment,
  rejectShipment,
  transportShipment,
  deliverShipment,
  handleServiceAgents,
} from './ducks';
import TspContainer from 'shared/TspPanel/TspContainer';
import Weights from 'shared/ShipmentWeights';
import Dates from 'shared/ShipmentDates';
import LocationsContainer from 'shared/LocationsPanel/LocationsContainer';
import FormButton from './FormButton';
import CustomerInfo from './CustomerInfo';
import PreApprovalPanel from 'shared/PreApprovalRequest/PreApprovalPanel.jsx';
import PickupForm from './PickupForm';
import PremoveSurveyForm from './PremoveSurveyForm';
import ServiceAgentForm from './ServiceAgentForm';
import { getLastRequestIsSuccess, getLastRequestIsLoading } from 'shared/Swagger/selectors';

import './tsp.css';

const generateGblLabel = 'Shipments.createGovBillOfLading';

const attachmentsErrorMessages = {
  400: 'An error occurred',
  417: 'Missing data required to generate a Bill of Lading.',
};

class AcceptShipmentPanel extends Component {
  rejectShipment = reason => {
    this.props.rejectShipment(reason);
  };

  acceptShipment = () => {
    this.props.acceptShipment();
  };

  render() {
    return (
      <div>
        <button className="usa-button-primary" onClick={this.acceptShipment}>
          Accept Shipment
        </button>
        <ConfirmWithReasonButton
          buttonTitle="Reject Shipment"
          reasonPrompt="Why are you rejecting this shipment?"
          warningPrompt="Are you sure you want to reject this shipment?"
          onConfirm={this.rejectShipment}
          buttonDisabled={true}
        />
      </div>
    );
  }
}

const DeliveryDateFormView = props => {
  const { schema, onCancel, handleSubmit, submitting, valid } = props;

  return (
    <form className="infoPanel-wizard" onSubmit={handleSubmit}>
      <div className="infoPanel-wizard-header">Enter Delivery</div>
      <SwaggerField fieldName="actual_delivery_date" swagger={schema} required />
      <p className="infoPanel-wizard-help">
        After clicking "Done", please upload the <strong>destination docs</strong>. Use the "Upload new document" link
        in the Documents panel at right.
      </p>

      <div className="infoPanel-wizard-actions-container">
        <a className="infoPanel-wizard-cancel" onClick={onCancel}>
          Cancel
        </a>
        <button className="usa-button-primary" type="submit" disabled={submitting || !valid}>
          Done
        </button>
      </div>
    </form>
  );
};

const DeliveryDateForm = reduxForm({ form: 'deliver_shipment' })(DeliveryDateFormView);

// Action Buttons Conditions
const hasOriginServiceAgent = (serviceAgents = []) => serviceAgents.some(agent => agent.role === 'ORIGIN');
const hasPreMoveSurvey = (shipment = {}) => shipment.pm_survey_planned_pack_date;

class ShipmentInfo extends Component {
  constructor(props) {
    super(props);

    this.assignTspServiceAgent = React.createRef();
  }
  state = {
    redirectToHome: false,
    editTspServiceAgent: false,
  };

  componentDidMount() {
    this.props.loadShipmentDependencies(this.props.match.params.shipmentId).catch(err => {
      this.props.history.replace('/');
    });
  }

  componentDidUpdate(prevProps, prevState) {
    if ((!prevProps.shipment.id && this.props.shipment.id) || prevProps.shipment.id !== this.props.shipment.id) {
      this.props.getAllShipmentDocuments(getShipmentDocumentsLabel, this.props.shipment.id);
      this.props.getAllTariff400ngItems(true, getTariff400ngItemsLabel);
      this.props.getAllShipmentLineItems(getShipmentLineItemsLabel, this.props.shipment.id);
    }
  }

  acceptShipment = () => {
    return this.props.acceptShipment(this.props.shipment.id);
  };

  generateGBL = () => {
    return this.props.generateGBL(generateGblLabel, this.props.shipment.id);
  };

  rejectShipment = reason => {
    return this.props.rejectShipment(this.props.shipment.id, reason).then(() => {
      this.setState({ redirectToHome: true });
    });
  };

  enterPreMoveSurvey = values => this.props.patchShipment(this.props.shipment.id, values);

  editServiceAgents = values => {
    values['destination_service_agent']['role'] = 'DESTINATION';
    values['origin_service_agent']['role'] = 'ORIGIN';
    this.props.handleServiceAgents(this.props.shipment.id, values);
  };

  transportShipment = values => this.props.transportShipment(this.props.shipment.id, values);

  deliverShipment = values => this.props.deliverShipment(this.props.shipment.id, values);

  render() {
    const {
      context,
      shipment,
      shipmentDocuments,
      generateGBLSuccess,
      generateGBLError,
      generateGBLInProgress,
      serviceAgents,
      loadTspDependenciesHasSuccess,
      gblGenerated,
    } = this.props;
    const { service_member: serviceMember = {}, move = {}, gbl_number: gbl } = shipment;

    const shipmentId = this.props.match.params.shipmentId;
    const newDocumentUrl = `/shipments/${shipmentId}/documents/new`;
    const showDocumentViewer = context.flags.documentViewer;
    const awarded = shipment.status === 'AWARDED';
    const accepted = shipment.status === 'ACCEPTED';
    const approved = shipment.status === 'APPROVED';
    const inTransit = shipment.status === 'IN_TRANSIT';
    const delivered = shipment.status === 'DELIVERED';
    const completed = shipment.status === 'COMPLETED';
    const pmSurveyComplete = Boolean(
      shipment.pm_survey_conducted_date &&
        shipment.pm_survey_method &&
        shipment.pm_survey_planned_pack_date &&
        shipment.pm_survey_planned_pickup_date &&
        shipment.pm_survey_planned_delivery_date &&
        shipment.pm_survey_weight_estimate,
    );
    const canAssignServiceAgents = (approved || accepted) && !hasOriginServiceAgent(serviceAgents);
    const canEnterPreMoveSurvey = approved && hasOriginServiceAgent(serviceAgents) && !hasPreMoveSurvey(shipment);
    const canEnterPackAndPickup = approved && gblGenerated;

    // Some statuses are directly related to the shipment status and some to combo states
    var statusText = 'Unknown status';
    if (awarded) {
      statusText = 'Shipment awarded';
    } else if (accepted) {
      statusText = 'Shipment accepted';
    } else if (approved && !pmSurveyComplete) {
      statusText = 'Awaiting pre-move survey';
    } else if (approved && pmSurveyComplete && !gblGenerated) {
      statusText = 'Pre-move survey complete';
    } else if (approved && pmSurveyComplete && gblGenerated) {
      statusText = 'Outbound';
    } else if (inTransit) {
      statusText = 'Inbound';
    } else if (delivered || completed) {
      statusText = 'Delivered';
    }

    if (this.state.redirectToHome) {
      return <Redirect to="/" />;
    }

    if (!loadTspDependenciesHasSuccess) {
      return <LoadingPlaceholder />;
    }

    return (
      <div>
        <div className="usa-grid grid-wide">
          <div className="usa-width-two-thirds page-title">
            <div className="move-info">
              <div className="move-info-code">
                MOVE INFO &mdash; {move.selected_move_type} CODE {shipment.traffic_distribution_list.code_of_service}
              </div>
              <div className="service-member-name">
                {serviceMember.last_name}, {serviceMember.first_name}
              </div>
            </div>
            <div className="shipment-status">Status: {statusText}</div>
          </div>
          <div className="usa-width-one-third nav-controls">
            {awarded && (
              <NavLink to="/queues/new" activeClassName="usa-current">
                <span>New Shipments Queue</span>
              </NavLink>
            )}
            {accepted && (
              <NavLink to="/queues/accepted" activeClassName="usa-current">
                <span>Accepted Shipments Queue</span>
              </NavLink>
            )}
            {approved && (
              <NavLink to="/queues/approved" activeClassName="usa-current">
                <span>Approved Shipments Queue</span>
              </NavLink>
            )}
            {inTransit && (
              <NavLink to="/queues/in_transit" activeClassName="usa-current">
                <span>In Transit Shipments Queue</span>
              </NavLink>
            )}
            {delivered && (
              <NavLink to="/queues/delivered" activeClassName="usa-current">
                <span>Delivered Shipments Queue</span>
              </NavLink>
            )}
            {completed && (
              <NavLink to="/queues/completed" activeClassName="usa-current">
                <span>Completed Shipments Queue</span>
              </NavLink>
            )}
            {!awarded &&
              !accepted &&
              !approved &&
              !inTransit &&
              !delivered &&
              !completed && (
                <NavLink to="/queues/all" activeClassName="usa-current">
                  <span>All Shipments Queue</span>
                </NavLink>
              )}
          </div>
        </div>
        <div className="usa-grid grid-wide">
          <div className="usa-width-one-whole">
            <ul className="move-info-header-meta">
              <li>
                GBL# {gbl}
                &nbsp;
              </li>
              <li>
                Locator# {move.locator}
                &nbsp;
              </li>
              <li>
                {this.props.shipment.source_gbloc} to {this.props.shipment.destination_gbloc}
                &nbsp;
              </li>
              <li>
                DoD ID# {serviceMember.edipi}
                &nbsp;
              </li>
              <li>
                {serviceMember.telephone}
                {serviceMember.phone_is_preferred && (
                  <FontAwesomeIcon className="icon icon-grey" icon={faPhone} flip="horizontal" />
                )}
                {serviceMember.text_message_is_preferred && (
                  <FontAwesomeIcon className="icon icon-grey" icon={faComments} />
                )}
                {serviceMember.email_is_preferred && <FontAwesomeIcon className="icon icon-grey" icon={faEmail} />}
                &nbsp;
              </li>
            </ul>
          </div>
        </div>
        <div className="usa-grid grid-wide panels-body">
          <div className="usa-width-one-whole">
            <div className="usa-width-two-thirds">
              {awarded && (
                <AcceptShipmentPanel
                  acceptShipment={this.acceptShipment}
                  rejectShipment={this.rejectShipment}
                  shipmentStatus={this.props.shipment.status}
                />
              )}

              {generateGBLError && (
                <p>
                  <Alert
                    type="warning"
                    heading={attachmentsErrorMessages[this.props.generateGBLError.status] || 'An error occurred'}
                  >
                    {titleCase(get(generateGBLError.response, 'body.message', '')) ||
                      'Something went wrong contacting the server.'}
                  </Alert>
                </p>
              )}

              {generateGBLSuccess && (
                <Alert type="success" heading="GBL has been created">
                  <span className="usa-grid usa-alert-no-padding">
                    <span className="usa-width-two-thirds">Click the button to view, print, or download the GBL.</span>
                    <span className="usa-width-one-third">
                      <Link to={`${this.props.gblDocUrl}`} className="usa-alert-right" target="_blank">
                        <button>View GBL</button>
                      </Link>
                    </span>
                  </span>
                </Alert>
              )}
              {approved &&
                pmSurveyComplete &&
                !gblGenerated && (
                  <div>
                    <button onClick={this.generateGBL} disabled={generateGBLInProgress}>
                      Generate the GBL
                    </button>
                  </div>
                )}
              {canEnterPreMoveSurvey && (
                <FormButton
                  FormComponent={PremoveSurveyForm}
                  schema={this.props.shipmentSchema}
                  onSubmit={this.enterPreMoveSurvey}
                  buttonTitle="Enter pre-move survey"
                />
              )}
              {canAssignServiceAgents && (
                <FormButton
                  serviceAgents={this.props.serviceAgents}
                  FormComponent={ServiceAgentForm}
                  schema={this.props.serviceAgentSchema}
                  onSubmit={this.editServiceAgents}
                  buttonTitle="Assign servicing agents"
                />
              )}

              {inTransit && (
                <FormButton
                  FormComponent={DeliveryDateForm}
                  schema={this.props.deliverSchema}
                  onSubmit={this.deliverShipment}
                  buttonTitle="Enter Delivery"
                />
              )}
              {canEnterPackAndPickup && (
                <FormButton
                  FormComponent={PickupForm}
                  schema={this.props.transportSchema}
                  onSubmit={this.transportShipment}
                  buttonTitle="Enter Pickup"
                />
              )}
              {this.props.loadTspDependenciesHasSuccess && (
                <div className="office-tab">
                  <Dates title="Dates" shipment={this.props.shipment} update={this.props.patchShipment} />
                  <Weights title="Weights & Items" shipment={this.props.shipment} update={this.props.patchShipment} />
                  <LocationsContainer update={this.props.patchShipment} />
                  <PreApprovalPanel shipmentId={this.props.match.params.shipmentId} />
                  <TspContainer
                    title="TSP & Servicing Agents"
                    shipment={this.props.shipment}
                    serviceAgents={this.props.serviceAgents}
                  />
                </div>
              )}
            </div>
            <div className="usa-width-one-third">
              <div className="customer-info">
                <h2 className="extras usa-heading">Customer Info</h2>
                <CustomerInfo />
              </div>
              <div className="documents">
                <h2 className="extras usa-heading">
                  Documents
                  {!showDocumentViewer && <FontAwesomeIcon className="icon" icon={faExternalLinkAlt} />}
                  {showDocumentViewer && (
                    <Link to={newDocumentUrl} target="_blank">
                      <FontAwesomeIcon className="icon" icon={faExternalLinkAlt} />
                    </Link>
                  )}
                </h2>
                <DocumentList
                  detailUrlPrefix={`/shipments/${shipmentId}/documents`}
                  moveDocuments={shipmentDocuments}
                />
                <Link className="status upload-documents-link" to={newDocumentUrl} target="_blank">
                  <span>
                    <FontAwesomeIcon className="icon link-blue" icon={faPlusCircle} />
                  </span>
                  Upload new document
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

const mapStateToProps = state => {
  const shipment = get(state, 'tsp.shipment', {});
  const shipmentDocuments = selectShipmentDocuments(state, shipment.id) || {};
  const gbl = shipmentDocuments.find(element => element.move_document_type === 'GOV_BILL_OF_LADING');
  const gblGenerated = !!gbl;

  return {
    swaggerError: state.swaggerPublic.hasErrored,
    shipment,
    shipmentDocuments,
    gblGenerated,
    tariff400ngItems: selectTariff400ngItems(state),
    shipmentLineItems: selectSortedShipmentLineItems(state),
    serviceAgents: get(state, 'tsp.serviceAgents', []),
    tsp: get(state, 'tsp'),
    loadTspDependenciesHasSuccess: get(state, 'tsp.loadTspDependenciesHasSuccess'),
    loadTspDependenciesHasError: get(state, 'tsp.loadTspDependenciesHasError'),
    acceptError: get(state, 'tsp.shipmentHasAcceptError'),
    generateGBLError: get(state, 'tsp.generateGBLError'),
    generateGBLSuccess: getLastRequestIsSuccess(state, generateGblLabel),
    generateGBLInProgress: getLastRequestIsLoading(state, generateGblLabel),
    gblDocUrl: `/shipments/${shipment.id}/documents/${get(gbl, 'id')}`,
    error: get(state, 'tsp.error'),
    shipmentSchema: get(state, 'swaggerPublic.spec.definitions.Shipment', {}),
    serviceAgentSchema: get(state, 'swaggerPublic.spec.definitions.ServiceAgent', {}),
    transportSchema: get(state, 'swaggerPublic.spec.definitions.TransportPayload', {}),
    deliverSchema: get(state, 'swaggerPublic.spec.definitions.ActualDeliveryDate', {}),
  };
};

const mapDispatchToProps = dispatch =>
  bindActionCreators(
    {
      loadShipmentDependencies,
      patchShipment,
      acceptShipment,
      generateGBL,
      rejectShipment,
      handleServiceAgents,
      transportShipment,
      deliverShipment,
      getAllShipmentDocuments,
      getAllTariff400ngItems,
      getAllShipmentLineItems,
    },
    dispatch,
  );

const connectedShipmentInfo = withContext(connect(mapStateToProps, mapDispatchToProps)(ShipmentInfo));

export { DeliveryDateFormView, connectedShipmentInfo as default };
