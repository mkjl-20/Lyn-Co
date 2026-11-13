# LynQ Customer, Staff, and Admin Workflow

This guide describes how a visit moves through LynQ, from booking/joining to
service and checkout, and what each role should do in common situations.
It reflects the current application behavior; it does not assume automatic
staff rebalancing or actions that the system does not currently perform.

## 1. Standard customer journey

### Customer

1. Open the salon's customer queue link or scan the salon QR code. At the salon,
   use the in-store kiosk if preferred.
2. Select **Walk-in** to join the current queue, or select **Appointment** and
   choose a future date and time during the configured appointment hours.
3. Enter a name. A mobile number is optional for a guest walk-in. A number is
   needed for SMS updates and phone appointments.
4. Choose one or more services. The service cards show their prices and
   durations. Choose a package or eligible offer if one is shown.
5. Choose a preferred staff member if desired. Review the wait quote, which is
   based on the selected first service and staff availability.
6. Select a customer type, if applicable: Regular, Senior, or PWD. VIP is not a
   customer self-selection; staff/admin manage VIP status.
7. Review the visit details, provide required privacy consent, and submit.
8. Keep the ticket/QR receipt open. It shows the ticket, queue position,
   estimated wait, service progress, and live updates. Customers can cancel
   while the visit is still eligible for cancellation.
9. When called, follow the on-screen/SMS instruction and proceed to the
   assigned station or chair.
10. At checkout, review the transaction summary with staff.

### Staff

1. Sign in and open the live staff queue. Receptionists use the Queue Desk to
   see all active visits; service providers see work relevant to their role,
   assigned stations, or customer preference. Search and status filters help
   locate visits during busy periods.
2. Review waiting services and their station/staff assignments. If the person
   is a walk-in or phone booking not yet in LynQ, use **Add walk-in** and enter
   their name, selected services, arrival type, priority type, and consent.
3. When a customer is due, call them and start the service at an available
   matching station. The service start and completion times are recorded.
4. Update service progress when needed. Complete the service in LynQ when
   finished; the next eligible service on that visit can then proceed.
5. If the customer requests another service while waiting or being served,
   select **Add service** on their queue entry. LynQ adds it to the visit and
   recalculates estimates/assignments.
6. If a customer cancels, cancel the waiting visit from its queue card and
   enter a reason. The reason is written to the audit log. Only waiting visits
   can be cancelled this way; ask an admin to resolve visits that have already
   started.

### Admin

1. Open **Queue Control** to see queue entries across salon stations.
2. Watch the crowding alert and service/station assignments.
3. Resolve exceptions: reorder waiting entries when operationally necessary
   (enter a reason, which is recorded in the audit log), assign services to a
   suitable active staff/station, and mark an unavailable station out of
   service with a reason. Reordering is restricted to administrators; staff
   queue cards do not expose manual reorder controls.
4. Review analytics/forecasting for demand and staffing recommendations. These
   are planning aids; the system does not automatically rebalance staff.
5. Use POS/Reports and Audit Logs to review transactions, adjustments, and
   operational changes.

## 2. Queue ordering and customer types

LynQ ranks on-time appointments ahead of walk-ins. Within each arrival group,
VIP is ranked first, Senior and PWD are ranked equally next, and Regular is
ranked after them. Thus an on-time regular appointment still ranks ahead of a
VIP walk-in. A late appointment loses appointment rank after the 15-minute
grace period and is handled as a walk-in. Current queue rank is not a promise
of an exact service start time: service type, an active service, available
qualified staff/stations, and manual queue changes affect actual waits.

The customer join form lets a customer choose Regular, Senior, or PWD.
Customers cannot self-assign VIP. Staff may enter priority when creating a
walk-in, and admins manage VIP customer records.

## 3. Common scenarios

### A. First-time customer

1. Scan the salon QR code or use the kiosk.
2. Join as a guest by entering a name and choosing services. A phone number is
   optional for a walk-in; without it, the customer does not receive SMS.
3. Review the service prices, estimate, and queue ticket before submitting.
4. Keep the ticket page open for updates and show the ticket when staff calls.
5. Staff checks the live queue, calls the customer, assigns/uses an available
   station, starts and completes each service, and checks out the visit.

**Account note:** Customer account registration currently uses email/password,
not phone OTP. The guest queue journey does not require creating an account.

### B. Returning regular customer

1. Join the same way as a first-time customer; saved customer history does not
   automatically change their priority.
2. Select Regular unless another eligible customer type applies.
3. If a number is supplied, use the same number to help staff/admin find the
   customer record and to receive configured SMS updates.
4. Staff handles the visit using the same queue and service steps.

### C. VIP customer

1. Admin first marks the customer as VIP in customer management; the customer
   must not self-select VIP.
2. The customer joins using the QR/kiosk and selects services. A matching
   customer record/phone number helps staff identify the VIP record.
3. Staff verifies the customer record if needed and handles service/station
   assignment through the queue.
4. The queue rank gives VIP higher priority than Senior/PWD/Regular within the
   same arrival group; it does not move a walk-in ahead of an on-time
   appointment.

### D. Senior or PWD customer

1. The customer selects Senior or PWD in the customer form, or staff selects
   the applicable type when adding a manual walk-in.
2. LynQ ranks these types ahead of Regular within the same appointment/walk-in
   group. Senior and PWD have the same configured rank.
3. Staff should provide appropriate in-person assistance and check that the
   selected service and station are suitable. The queue label alone is not
   verification of eligibility.

### E. Customer has a preferred staff member

1. Customer selects the preferred staff member before joining.
2. LynQ checks whether that staff member is active and suitable for the
   selected service and shows an availability-aware wait quote for the
   selection.
3. If the wait is too long or that staff member is unavailable, customer can
   choose the general/any-staff option or another listed staff member and
   review the updated quote before joining.
4. Staff confirms the final assignment when starting the service; availability
   can change between the quote and service start.

### F. Busy time or a long queue

**Customer steps**

1. Check the estimated wait before submitting. If the selected staff member
   has a long wait, try the any-staff option or another available staff
   member, then compare the quote.
2. Choose a future appointment instead of joining the current walk-in queue if
   the customer cannot wait. Appointments must be in the future and within the
   configured booking hours.
3. Join once and keep the ticket page open. Do not repeatedly submit to check
   position; the API rate-limits repeated queue requests.
4. If plans change, cancel the waiting visit in the ticket page.

**Staff steps**

1. Keep queue status current: call customers, start services, complete
   services, and mark cancellations/no-shows promptly.
2. Add any additional requested service to the existing visit instead of
   creating a duplicate queue entry.
3. Tell customers if the estimate changes or if no matching station is free.
   The ticket page refreshes from live updates and a polling fallback.

**Admin steps**

1. Monitor the crowding alert in Queue Control. The threshold is based on the
   salon's configured crowd threshold.
2. Check which services/stations are bottlenecks and whether any station
   should be taken out of service (record a reason).
3. Use queue reordering only for a valid operational reason and explain
   material changes to affected customers.
4. Review forecast/staffing recommendations for future scheduling.

### G. Sudden traffic congestion / rush of arrivals

1. LynQ accepts valid joins subject to its rate limits, records each selected
   service and price, assigns available service resources where possible, and
   updates the wait estimates.
2. When waiting volume reaches the configured threshold, Queue Control shows
   an admin crowding alert.
3. Admin checks the live queue, active services, station availability, and
   forecast recommendations. Admin may reorder waiting entries or make
   operational staffing/station decisions.
4. Staff continues to call/start/complete work and add a customer's additional
   service to that customer's existing visit.
5. Customers can use their live ticket to track their place, consider a
   different available staff option before joining, choose an appointment, or
   cancel if they cannot wait.

**Important current limitation:** crowding does not automatically add staff,
rebalance staff workload, reassign a staff member's waiting customers, or send
a dedicated crowd alert to staff. Staff rebalancing suggestions with
accept/decline actions are not currently implemented. During a major surge,
the admin/manager must coordinate staff and communicate delays.

### H. Group arriving together

1. One customer selects the party/group option and enters each member's name
   and that member's services (up to eight members total).
2. Each member receives a separately tracked queue entry tied to the same
   party, so service progress is individual.
3. Staff processes each member's entry separately and updates each service.
4. Current party joins do not apply a package or promotion in the join request;
   choose each member's services individually.

### I. Appointment arrives late

1. Customer should tell staff on arrival.
2. If more than 15 minutes late, LynQ changes the effective arrival to
   walk-in priority; the original appointment priority no longer applies.
3. Staff checks the resulting live queue and advises the customer of the
   current estimate.

### J. Service/station unavailable

1. Staff selects an available matching station when starting the service.
2. If no matching station is free, staff informs the customer and leaves the
   service waiting until it can start; do not mark it started prematurely.
3. If a station is broken or unusable, admin marks it out of service and enters
   the reason. Staff/admin then use another suitable station if available.
4. Automatic reassignment caused by a staff member becoming unavailable is
   not currently supported; admin/staff must review and reassign affected
   waiting work manually.

## 4. Notifications and connectivity

- The ticket/QR and live status are the primary customer-facing queue receipt.
- SMS templates exist for join and service/turn milestones, but delivery
  requires configured SMS gateway credentials and a working provider. A guest
  with no phone number cannot receive SMS.
- Realtime queue updates are supplemented by periodic refresh/reconnect
  behavior in the UI. A two-second polling interval is a fallback, not a
  measured end-to-end guarantee that every alert arrives within two seconds.
- If a customer loses connectivity, keep their ticket URL/QR and reload when
  connected. Staff/admin should use the live queue as the operational source
  of truth and handle duplicate or stale tickets carefully.

## 5. System limits to account for operationally

- Rate limiting currently allows up to 30 join requests per IP per 15 minutes
  and 5 per supplied phone number per 30 minutes. The limiter is in-memory;
  multi-instance deployments need a shared rate-limit store.
- Queue rank is deterministic, but estimates can change as services start,
  complete, stations become unavailable, or admins reorder the queue.
- Staff unavailability with automatic customer reassignment, staff
  accept/decline workload rebalancing, and automated surge staffing are not
  available yet.
- SMS delivery, production database migrations, and the current station/device
  configuration must be tested in the target deployment before relying on
  them operationally.
