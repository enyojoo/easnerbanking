/**
 * Do not embed payroll_people or payroll_payment_methods from
 * payroll_connections here.
 *
 * Those tables point at each other:
 * - payroll_connections.person_id -> payroll_people.id
 * - payroll_people.connection_id -> payroll_connections.id
 * - payroll_payment_methods.connection_id -> payroll_connections.id
 * - payroll_connections.preferred_method_id -> payroll_payment_methods.id
 *
 * PostgREST therefore requires a named relationship. The personal connection
 * PostgREST cannot infer which relationship is intended for either pair.
 * The personal connection APIs fetch both related records explicitly by ID so
 * these selectors remain stable across environments and constraint names.
 */
export const PERSONAL_PAYROLL_CONNECTION_LIST_SELECT =
  "*,businesses(name,easetag,logo_url,noah_kyb_status)"

export const PERSONAL_PAYROLL_CONNECTION_DETAIL_SELECT =
  "*,businesses(name,easetag,logo_url,noah_kyb_status)"

export const PERSONAL_PAYROLL_METHOD_SELECT =
  "id,connection_id,type,label,owner_type,status,full_name,country_code,currency,account_number,bank_name,phone_number,email,mobile_provider,wallet_network,routing_number,sort_code,iban,swift_bic,transfer_type,checking_or_savings,address_line1,city,state,postal_code,metadata"
