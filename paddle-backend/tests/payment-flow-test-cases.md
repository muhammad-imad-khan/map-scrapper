# Payment Flow Test Cases

## Automated smoke coverage

1. Home page pricing cards route to the new payment page with `starter`, `pro`, and `agency` query values.
2. Home page navigation and footer expose the new Payment page.
3. About and Terms pages expose the new Payment page in navigation and footer.
4. Terms page no longer references Gumroad for credit purchases.
5. Payment page contains plan switching, country selector, currency selector, Pakistan payment methods, and global hosted checkout UI.
6. Payment page runtime shows Pakistan bank/Sadapay details when country is Pakistan.
7. Payment page runtime shows the hosted checkout section when country is not Pakistan.
8. Payment page runtime updates the selected plan summary and reference code from URL state.
9. Payment page runtime redirects to the configured checkout URL when the hosted checkout button is clicked.
10. Backend `/api/payment-config` returns the configured checkout URL.
11. Backend `/api/payment-config` returns `404` when no checkout URL is configured.
12. Backend `/api/health` reports whether checkout configuration is present.

## Manual regression checks

1. Open the home page on desktop and mobile, click each pricing card and confirm the payment page opens with the correct plan selected.
2. On the payment page, switch the country between Pakistan and a non-Pakistan option and confirm the correct payment section appears each time.
3. Confirm the selected country and currency remain reflected in the URL after changing them.
4. Confirm the nav burger still opens and closes correctly on mobile pages after the new Payment link was added.
5. Confirm the checkout button remains disabled with an error state when the backend does not provide `PAYMENT_CHECKOUT_URL`.