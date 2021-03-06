package rateengine

import (
	"fmt"

	"github.com/transcom/mymove/pkg/models"
	"github.com/transcom/mymove/pkg/testdatagen"
	"github.com/transcom/mymove/pkg/unit"
)

func (suite *RateEngineSuite) createShipmentWithServiceArea(assertions testdatagen.Assertions) models.Shipment {
	shipment := testdatagen.MakeShipment(suite.db, assertions)

	zip3 := models.Tariff400ngZip3{
		Zip3:          Zip5ToZip3(shipment.PickupAddress.PostalCode),
		BasepointCity: "Saucier",
		State:         "MS",
		ServiceArea:   "428",
		RateArea:      "US48",
		Region:        "11",
	}
	suite.mustSave(&zip3)

	serviceArea := models.Tariff400ngServiceArea{
		Name:               "Gulfport, MS",
		ServiceArea:        "428",
		LinehaulFactor:     57,
		ServiceChargeCents: 350,
		ServicesSchedule:   1,
		EffectiveDateLower: testdatagen.Tariff400ngItemRateEffectiveDateLower,
		EffectiveDateUpper: testdatagen.Tariff400ngItemRateEffectiveDateUpper,
		SIT185ARateCents:   unit.Cents(50),
		SIT185BRateCents:   unit.Cents(50),
		SITPDSchedule:      1,
	}
	suite.mustSave(&serviceArea)

	return shipment
}

func (suite *RateEngineSuite) TestAccessorialsPricingPackCrate() {
	itemCode := "105B"
	rateCents := unit.Cents(2275)
	netWeight := unit.Pound(1000)
	shipment := suite.createShipmentWithServiceArea(testdatagen.Assertions{
		Shipment: models.Shipment{
			BookDate:  &testdatagen.Tariff400ngItemRateDefaultValidDate,
			NetWeight: &netWeight,
		},
	})
	item := testdatagen.MakeShipmentLineItem(suite.db, testdatagen.Assertions{
		ShipmentLineItem: models.ShipmentLineItem{
			Quantity1: unit.BaseQuantity(50000),
			Shipment:  shipment,
			Status:    models.ShipmentLineItemStatusAPPROVED,
			Location:  models.ShipmentLineItemLocationORIGIN,
		},
		Tariff400ngItem: models.Tariff400ngItem{
			Code:                itemCode,
			RequiresPreApproval: true,
		},
	})

	testdatagen.MakeTariff400ngItemRate(suite.db, testdatagen.Assertions{
		Tariff400ngItemRate: models.Tariff400ngItemRate{
			Code:      itemCode,
			RateCents: rateCents,
		},
	})

	engine := NewRateEngine(suite.db, suite.logger, suite.planner)
	computedPrice, err := engine.ComputeShipmentLineItemCharge(item, item.Shipment)

	if suite.NoError(err) {
		suite.Equal(rateCents.Multiply(5), computedPrice)
	}
}

// Iterates through all codes that have pricers and make sure they don't explode with sane values
func (suite *RateEngineSuite) TestAccessorialsSmokeTest() {
	rateCents := unit.Cents(100)
	netWeight := unit.Pound(1000)
	shipment := suite.createShipmentWithServiceArea(testdatagen.Assertions{
		Shipment: models.Shipment{
			BookDate:  &testdatagen.Tariff400ngItemRateDefaultValidDate,
			NetWeight: &netWeight,
		},
	})

	for code := range tariff400ngItemPricing {
		item := testdatagen.MakeShipmentLineItem(suite.db, testdatagen.Assertions{
			ShipmentLineItem: models.ShipmentLineItem{
				Quantity1: unit.BaseQuantityFromInt(1),
				Shipment:  shipment,
				Status:    models.ShipmentLineItemStatusAPPROVED,
				Location:  models.ShipmentLineItemLocationORIGIN,
			},
			Tariff400ngItem: models.Tariff400ngItem{
				Code:                code,
				RequiresPreApproval: true,
			},
		})

		rateCode := code
		if newCode, ok := tariff400ngItemRateMap[code]; ok {
			rateCode = newCode
		}

		testdatagen.MakeTariff400ngItemRate(suite.db, testdatagen.Assertions{
			Tariff400ngItemRate: models.Tariff400ngItemRate{
				Code:      rateCode,
				RateCents: rateCents,
			},
		})

		engine := NewRateEngine(suite.db, suite.logger, suite.planner)
		_, err := engine.ComputeShipmentLineItemCharge(item, item.Shipment)

		// Make sure we don't error
		if !suite.NoError(err) {
			fmt.Printf("Failed while running code %v\n", code)
		}
	}
}
