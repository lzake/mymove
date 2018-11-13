import React from 'react';
import { mount } from 'enzyme';

import { InvoicePanel } from './InvoicePanel';

describe('InvoicePanel tests', () => {
  describe('When no items exist', () => {
    let wrapper;
    const shipmentLineItems = [];
    wrapper = mount(<InvoicePanel shipmentLineItems={shipmentLineItems} />);

    it('renders without crashing', () => {
      expect(wrapper.find('.empty-content').length).toEqual(1);
    });
  });

  describe('When line items exist', () => {
    let wrapper;
    const shipmentLineItems = [
      {
        id: 'sldkjf',
        tariff400ng_item: { code: '105D', item: 'Reg Shipping' },
        amount: 1,
        quantity_1: 1,
        location: ['D'],
      },
      {
        id: 'sldsdff',
        tariff400ng_item: { code: '105D', item: 'Reg Shipping' },
        location: ['D'],
        amount: 1,
        quantity_1: 1,
      },
    ];
    wrapper = mount(<InvoicePanel shipmentLineItems={shipmentLineItems} />);
    it('renders the table', () => {
      expect(wrapper.find('table').length).toEqual(1);
    });
  });
});