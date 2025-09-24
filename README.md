# thunderbird-website

a test of a merit badge ai website

## Foundation scholarship controls

Troops that should receive a quiet, zero-cost checkout can be maintained in
`data/authorized-troops.json`. Populate the `fullScholarship` array with troop
numbers (numbers or alphanumeric identifiers are supported). When a scout from
one of these troops completes the profile form the dashboard will quietly note
their sponsorship, and the payment calculator will automatically set their
balance to $0 without exposing the discount publicly.

Update the list whenever new troops are approved and redeploy the site. The
payment form still accepts general promotion codes (for example, `EAGLEDUO`),
but the former `URBAN20` code has been removed because troop-based
authorization now controls the scholarship.
