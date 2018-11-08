/* global cy */

describe('service member adds a ppm to an hhg', function() {
  it('service member clicks on Add PPM Shipment', function() {
    serviceMemberSignsIn('7980f0cf-63e3-4722-b5aa-ba46f8f7ac64');
    serviceMemberAddsPPMToHHG();
    serviceMemeberCancelsAddPPMToHHG();
    serviceMemberCannotAddPPMToHHG();
  });
});

function serviceMemberSignsIn(uuid) {
  cy.signInAsUser(uuid);
}

function serviceMemberAddsPPMToHHG() {
  cy
    .get('.sidebar > div > a')
    .contains('Add PPM Shipment')
    .click();

  cy.location().should(loc => {
    expect(loc.pathname).to.match(/^\/moves\/[^/]+\/hhg-ppm-start/);
  });
}

function serviceMemeberCancelsAddPPMToHHG() {
  cy
    .get('.usa-button-secondary')
    .contains('Cancel')
    .click();

  cy.location().should(loc => {
    expect(loc.pathname).to.match(/^\//);
  });
}

function serviceMemberCannotAddPPMToHHG() {
  cy.get('.sidebar > div > a').should('not.exist');
}
