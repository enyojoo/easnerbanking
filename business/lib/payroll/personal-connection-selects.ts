/**
 * Do not embed payroll_people from payroll_connections here.
 *
 * Those tables point at each other:
 * - payroll_connections.person_id -> payroll_people.id
 * - payroll_people.connection_id -> payroll_connections.id
 *
 * PostgREST therefore requires a named relationship. The personal connection
 * APIs fetch person data separately by person_id so these selectors remain
 * stable across environments and schema constraint names.
 */
export const PERSONAL_PAYROLL_CONNECTION_LIST_SELECT =
  "*,businesses(name,easetag,logo_url,noah_kyb_status),payroll_payment_methods(id,type,label,masked_details,owner_type,status)"

export const PERSONAL_PAYROLL_CONNECTION_DETAIL_SELECT =
  "*,businesses(name,easetag,logo_url,noah_kyb_status),payroll_payment_methods(id,type,label,masked_details,owner_type,status)"
