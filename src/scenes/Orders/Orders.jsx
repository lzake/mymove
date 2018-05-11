import { get } from 'lodash';
import PropTypes from 'prop-types';
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { Field } from 'redux-form';

import { createOrders, updateOrders, showCurrentOrders } from './ducks';
import { loadServiceMember } from 'scenes/ServiceMembers/ducks';
import { reduxifyWizardForm } from 'shared/WizardPage/Form';
import DutyStationSearchBox from 'scenes/ServiceMembers/DutyStationSearchBox';
import YesNoBoolean from 'shared/Inputs/YesNoBoolean';
import { SwaggerField } from 'shared/JsonSchemaForm/JsonSchemaField';

import './Orders.css';

const validateOrdersForm = (values, form) => {
  let errors = {};

  const required_fields = ['has_dependents', 'new_duty_station'];

  required_fields.forEach(fieldName => {
    if (values[fieldName] === undefined || values[fieldName] === '') {
      errors[fieldName] = 'Required.';
    }
  });

  return errors;
};

const formName = 'orders_info';
const OrdersWizardForm = reduxifyWizardForm(formName, validateOrdersForm);

export class Orders extends Component {
  handleSubmit = () => {
    const pendingValues = this.props.formData.values;
    // Update if orders object already extant
    if (pendingValues) {
      pendingValues['service_member_id'] = this.props.currentServiceMember.id;
      pendingValues['new_duty_station_id'] = pendingValues.new_duty_station.id;
      if (this.props.currentOrders) {
        this.props.updateOrders(this.props.currentOrders.id, pendingValues);
      } else {
        this.props.createOrders(pendingValues);
      }
    }
  };

  componentDidMount() {
    // If we have a logged in user at mount time, do our loading then.
    if (this.props.currentServiceMember) {
      const serviceMemberID = this.props.currentServiceMember.id;
      this.props.showCurrentOrders(serviceMemberID);
    }
  }

  componentDidUpdate(prevProps, prevState) {
    // If we don't have a service member yet, fetch it and the current orders when loggedInUser loads.
    if (
      !prevProps.currentServiceMember &&
      this.props.currentServiceMember &&
      !this.props.currentOrders
    ) {
      const serviceMemberID = this.props.currentServiceMember.id;
      this.props.showCurrentOrders(serviceMemberID);
    }
  }

  render() {
    const {
      pages,
      pageKey,
      hasSubmitSuccess,
      error,
      currentOrders,
      currentServiceMember,
    } = this.props;
    // initialValues has to be null until there are values from the action since only the first values are taken
    const initialValues = currentOrders ? currentOrders : null;
    const serviceMemberId = currentServiceMember
      ? currentServiceMember.id
      : null;
    return (
      <OrdersWizardForm
        handleSubmit={this.handleSubmit}
        className={formName}
        pageList={pages}
        pageKey={pageKey}
        hasSucceeded={hasSubmitSuccess}
        serverError={error}
        initialValues={initialValues}
        additionalParams={{ serviceMemberId }}
      >
        <h1 className="sm-heading">Tell Us About Your Move Orders</h1>
        <SwaggerField
          fieldName="orders_type"
          swagger={this.props.schema}
          required
        />
        <SwaggerField
          fieldName="issue_date"
          swagger={this.props.schema}
          required
        />
        <SwaggerField
          fieldName="report_by_date"
          swagger={this.props.schema}
          required
        />
        <fieldset key="dependents">
          <legend htmlFor="dependents">
            Are dependents included in your orders?
          </legend>
          <Field name="has_dependents" component={YesNoBoolean} />
        </fieldset>
        <Field name="new_duty_station" component={DutyStationSearchBox} />
      </OrdersWizardForm>
    );
  }
}
Orders.propTypes = {
  schema: PropTypes.object.isRequired,
  updateOrders: PropTypes.func.isRequired,
  currentOrders: PropTypes.object,
  error: PropTypes.object,
  hasSubmitSuccess: PropTypes.bool.isRequired,
};

function mapDispatchToProps(dispatch) {
  return bindActionCreators(
    { updateOrders, createOrders, showCurrentOrders, loadServiceMember },
    dispatch,
  );
}
function mapStateToProps(state) {
  const error = state.loggedInUser.error || state.orders.error;
  const hasSubmitSuccess =
    state.loggedInUser.hasSubmitSuccess || state.orders.hasSubmitSuccess;
  const props = {
    currentServiceMember: get(
      state,
      'loggedInUser.loggedInUser.service_member',
    ),
    schema: get(
      state,
      'swagger.spec.definitions.CreateUpdateOrdersPayload',
      {},
    ),
    formData: state.form[formName],
    currentOrders: state.orders.currentOrders,
    error,
    hasSubmitSuccess,
  };
  return props;
}
export default connect(mapStateToProps, mapDispatchToProps)(Orders);