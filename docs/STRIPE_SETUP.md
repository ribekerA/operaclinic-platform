# Stripe Integration Setup Guide

This guide covers setting up Stripe for OperaClinic commercial onboarding payments.

## Overview

OperaClinic uses Stripe for processing commercial plan payments. The payment system is abstracted via a `PaymentAdapter` interface, supporting development with mock payments and production with real Stripe processing.

**Architecture:**
- `payment.adapter.ts` - Interface defining payment operations
- `mock-payment.adapter.ts` - Development implementation (instant payments)
- `stripe-payment.adapter.ts` - Production Stripe implementation
- `payment-adapter.factory.ts` - Factory selecting adapter based on environment

## Getting Started

### 1. Create a Stripe Account

1. Go to [https://stripe.com](https://stripe.com)
2. Create an account or sign in
3. Navigate to the [Dashboard](https://dashboard.stripe.com)

### 2. Get API Keys

1. Go to [API Keys](https://dashboard.stripe.com/apikeys)
2. Copy your **Secret Key** (starts with `sk_test_` or `sk_live_`)
3. Add to `.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   ```

### 3. Create a Webhook Endpoint

Webhooks allow Stripe to notify your backend about payment events.

#### For Local Development (Using Stripe CLI)

1. **Install Stripe CLI:**
   - [macOS/Linux](https://stripe.com/docs/stripe-cli#install-linux)
   - [Windows](https://stripe.com/docs/stripe-cli#install-windows)

2. **Login to Stripe:**
   ```bash
   stripe login
   ```
   This opens a browser to authenticate your Stripe account.

3. **Start Local Webhook Forwarding:**
   ```bash
   stripe listen --forward-to localhost:3001/api/v1/commercial/webhook/payment
   ```

4. **Copy the Webhook Signing Secret:**
   The CLI output shows: `Ready! Your webhook signing secret is: whsec_test_...`
   
5. **Add to `.env`:**
   ```
   STRIPE_WEBHOOK_SECRET=whsec_test_...
   ```

#### For Staging/Production (Manual Setup)

1. Go to [Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Enter endpoint URL: `https://your-domain.com/api/v1/commercial/webhook/payment`
4. Select events to listen for:
   - `payment_intent.succeeded` (payment completed)
   - `charge.refunded` (refund issued)
5. Click **Add events** and then **Add endpoint**
6. Copy the signing secret and add to `.env`

### 4. Configure Environment

Edit `.env` with your Stripe keys:

```bash
# Test Mode (Development)
STRIPE_SECRET_KEY=sk_test_51234567890abcdefgh
STRIPE_WEBHOOK_SECRET=whsec_test_1234567890abcdefgh

# Production (after switching to Live mode)
STRIPE_SECRET_KEY=sk_live_51234567890abcdefgh
STRIPE_WEBHOOK_SECRET=whsec_live_1234567890abcdefgh

# Commercial settings
COMMERCIAL_ONBOARDING_TTL_HOURS=48
WEB_URL=http://localhost:3000
```

### 5. Test Payments

#### Using Mock Adapter (Default in Development)

No Stripe keys required. Payments are instantly confirmed:

```bash
# Start backend
pnpm dev

# In another terminal, run E2E tests
pnpm test:e2e
```

#### Using Stripe (With Real Test Cards)

1. Ensure `STRIPE_SECRET_KEY` is set
2. Start backend: `pnpm dev`
3. Start Stripe CLI webhook forwarding (see above)
4. Run E2E tests or manually test:

```bash
# List plans
curl http://localhost:3001/api/v1/commercial/plans

# Start onboarding
curl -X POST http://localhost:3001/api/v1/commercial/onboarding/start \
  -H "Content-Type: application/json" \
  -d '{"planId":"..."}'

# Create checkout
curl -X POST http://localhost:3001/api/v1/commercial/onboarding/{token}/create-checkout

# Use Stripe's test card: 4242 4242 4242 4242
# Expires: any future date (e.g., 12/25)
# CVC: any 3 digits (e.g., 123)
```

## Test Cards

Use these cards in Stripe's hosted checkout for testing:

| Scenario | Card Number | Expires | CVC |
|----------|------------|---------|-----|
| Success | 4242 4242 4242 4242 | Any future | Any 3 digits |
| Decline | 4000 0000 0000 0002 | Any future | Any 3 digits |
| Requires Auth (3D Secure) | 4000 0025 0000 3155 | Any future | Any 3 digits |

More test cards: [Stripe Docs](https://stripe.com/docs/testing)

## API Endpoint Map

### Public Endpoints

```
GET  /commercial/plans
     List available plans

POST /commercial/onboarding/start
     Input: { planId: string }
     Output: { onboardingToken: string, onboarding: ... }

GET  /commercial/onboarding/{token}
     Get onboarding status

POST /commercial/onboarding/{token}/complete
     Input: { clinicData, adminData, ... }
     Output: { onboarding with status AWAITING_PAYMENT }

POST /commercial/onboarding/{token}/create-checkout
     Output: { checkoutUrl: string, sessionId: string }
     Action: Redirects user to Stripe checkout

POST /commercial/onboarding/{token}/confirm-checkout?sessionId={sessionId}
     Confirms payment received
     Output: { onboarding with status PAID }

POST /commercial/onboarding/{token}/finalize
     Creates tenant, clinic, admin user, subscription
     Output: { onboarding with status ONBOARDING_COMPLETED }

POST /commercial/webhook/payment
     Stripe webhook endpoint (no auth required)
     Handles: payment_intent.succeeded, charge.refunded
```

## Rate Limiting

Commercial endpoints have rate limits:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/start` | 10 | per minute |
| `/status` | 10 | per minute |
| `/complete` | 5 | per minute |
| `/create-checkout` | 5 | per minute |
| `/confirm-checkout` | 5 | per minute |
| `/finalize` | 3 | per minute |

## Troubleshooting

### 1. "STRIPE_SECRET_KEY must be set in production environment"

**Cause:** Running in production mode without Stripe key.

**Solution:** Set `STRIPE_SECRET_KEY` in `.env` or use `NODE_ENV=development` for testing.

### 2. Webhook signature verification failed

**Cause:** Mismatched `STRIPE_WEBHOOK_SECRET` or webhook secret changed.

**Solution:**
1. Verify correct secret in Dashboard
2. Restart backend to reload env vars
3. Restart Stripe CLI with correct secret

### 3. Checkout session expires immediately

**Cause:** Server time differs significantly from Stripe servers.

**Solution:**
- Ensure server time is synchronized (NTP)
- Check server clock: `date`

### 4. Cannot create checkout with mock adapter

**Cause:** Backend selecting mock adapter when Stripe needed.

**Solution:**
```bash
# Force Stripe adapter
STRIPE_SECRET_KEY=sk_test_... pnpm dev
```

### 5. Payment confirmed but onboarding doesn't finalize

**Cause:** Webhook not received or not processed.

**Solution:**
1. Check webhook logs in Stripe Dashboard
2. Verify webhook endpoint in `.env`
3. Ensure Stripe CLI still running (for local testing)

## Environment Variables Reference

```bash
# Required for production
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_live_...

# Optional (auto-detected if not set)
COMMERCIAL_ONBOARDING_TTL_HOURS=48        # Default: 48
PAYMENT_PROVIDER=stripe                    # Default: auto (mock in dev, stripe if key set)
WEB_URL=http://localhost:3000              # Checkout redirect URL
```

## Development Workflow

### Local Testing (Mock Mode)

```bash
# No Stripe setup needed
pnpm dev

# Run E2E tests
pnpm test:e2e

# Test covers: plan listing → registration → payment confirmation → finalization
```

### Local Testing (Real Stripe Payments)

```bash
# Terminal 1: Start Stripe CLI forwarding
stripe listen --forward-to localhost:3001/api/v1/commercial/webhook/payment

# Terminal 2: Set env vars and start backend
export STRIPE_SECRET_KEY=sk_test_...
export STRIPE_WEBHOOK_SECRET=whsec_test_...
pnpm dev

# Terminal 3: Run tests or manual checkout
curl http://localhost:3001/api/v1/commercial/plans
```

### Production Deployment

1. **Switch Stripe to Live Mode:**
   - Go to Dashboard → Settings
   - Toggle "View test data" to OFF

2. **Get Live Keys:**
   - Dashboard → API Keys
   - Copy `sk_live_...` and configure webhook

3. **Update Deployment:**
   ```bash
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_live_...
   ```

4. **Test Payment:**
   - Use real card (or small test amount if supported by Stripe)
   - Verify webhook endpoint is publicly accessible
   - Monitor Dashboard → Webhooks for delivery

## Webhook Monitoring and Operations

Webhooks are critical for payment state synchronization. Silent failures can cause onboardings to get stuck in `AWAITING_PAYMENT` status indefinitely.

### ✅ Pre-Production Webhook Checklist

Before deploying to production, verify:

- [ ] Webhook endpoint URL is publicly accessible: `curl https://your-domain.com/api/v1/commercial/webhook/payment`
- [ ] STRIPE_WEBHOOK_SECRET is set in production environment (not committed to code)
- [ ] Backend is restarted after secret changes
- [ ] Webhook signature verification is enabled in `stripe-payment.adapter.ts`
- [ ] Audit logging is capturing webhook events: `SELECT * FROM audit_logs WHERE action LIKE '%WEBHOOK%' ORDER BY createdAt DESC`
- [ ] Error alerting is configured (see Monitoring section below)
- [ ] Escalation endpoint is working: test `POST /commercial/onboarding/{token}/escalate-to-staff`
- [ ] Staff has access to escalated onboardings in admin control plane

### Monitoring Webhook Delivery

1. **Stripe Dashboard Webhook Logs:**
   - Go to [Webhooks](https://dashboard.stripe.com/webhooks)
   - Click your endpoint → **Logs** tab
   - Monitor recent delivery attempts (green = success, red = failed)
   - Failed webhooks show error details (network timeout, invalid signature, etc.)

2. **Set Up Alerts (Recommended):**
   - Go to [Webhooks](https://dashboard.stripe.com/webhooks) → Your endpoint
   - Enable **Event Delivery Alerts** (sends email if delivery fails multiple times)
   - Create custom Alert Rule: "Webhook endpoint failure rate > 5%"

3. **Application-Level Monitoring:**
   - Log all webhook processing: `grep "Successfully processed webhook" your-logs`
   - Monitor onboarding status stuck in `AWAITING_PAYMENT`: `SELECT COUNT(*) FROM commercial_onboardings WHERE status = 'AWAITING_PAYMENT' AND updatedAt < NOW() - INTERVAL '2 hours'`
   - Alert if count exceeds threshold (typically 0 in normal operation)

### Webhook Rotation Policy

Rotate webhook secrets periodically to reduce exposure:

1. **For Production:**
   - Go to [Webhooks](https://dashboard.stripe.com/webhooks) → Your endpoint
   - Click **Reveal signing secret** and note current secret
   - Update `STRIPE_WEBHOOK_SECRET` in production environment
   - Restart backend to apply new secret
   - Verify new secret is working by checking Stripe Dashboard logs (should see success)
   - **Only delete old endpoint after 24-48 hours of successful delivery with new secret**

2. **Rotation Schedule:**
   - Every 90 days during normal operations
   - Immediately if suspected compromise
   - After any infrastructure changes

3. **Verify Rotation:**
   ```bash
   # After updating secret, test from Stripe Dashboard
   # Event: Send test webhook from endpoint → Test Events
   # Should see delivery success in Logs tab
   ```

### Handling Webhook Failures

If webhooks are not delivering:

1. **Step 1: Check Endpoint Accessibility**
   ```bash
   # Endpoint must be publicly accessible
   curl -i https://your-domain.com/api/v1/commercial/webhook/payment
   # Should return 400+ (no POST body expected for test)
   ```

2. **Step 2: Verify Signature Secret**
   - Confirm `STRIPE_WEBHOOK_SECRET` in environment matches Stripe Dashboard
   - If changed, restart backend immediately
   - Test with: `stripe login` → `stripe listen --print-secret`

3. **Step 3: Check Firewall & Network**
   - Verify Stripe IP range is not blocked
   - Check load balancer/reverse proxy configs
   - Ensure no WAF rules blocking webhook endpoint

4. **Step 4: Retry Failed Webhooks**
   - Go to [Webhooks](https://dashboard.stripe.com/webhooks) → Your endpoint → Failed logs
   - Select failed webhook entry → **Resend**
   - Monitor logs for success

5. **Step 5: Escalate to Support**
   - If failures persist, check [Stripe Status Page](https://status.stripe.com) for infrastructure issues
   - Contact Stripe Support with webhook ID and error details

### Manual Payment Recovery

If webhook fails but payment actually succeeded:

1. **Verify Payment in Stripe:**
   - Go to [Payments](https://dashboard.stripe.com/payments)
   - Find payment by onboarding ID or clinic email
   - Confirm `status` is `succeeded`

2. **Option A: Retry Webhook from Stripe**
   - Go to [Webhooks](https://dashboard.stripe.com/webhooks) → Logs
   - Find the failed webhook entry
   - Click **Resend** and monitor for success

3. **Option B: Manual Backend Retry**
   ```bash
   # If webhook continues to fail, admin can force confirmation
   curl -X POST https://your-domain.com/api/v1/commercial/onboarding/{token}/confirm-checkout?sessionId={sessionId} \
     -H "Authorization: Bearer {admin-token}" \
     -H "Content-Type: application/json"
   ```

4. **Option C: Escalate to Staff**
   ```bash
   # Last resort: flag for manual review
   curl -X POST https://your-domain.com/api/v1/commercial/onboarding/{token}/escalate-to-staff \
     -H "Content-Type: application/json" \
     -d '{"reason": "Webhook failure - manual recovery needed"}'
   ```
   - Backend marks onboarding as `ESCALATED_TO_STAFF`
   - Staff reviews in admin control plane
   - Manual finalization of tenant/clinic setup

### Webhook Audit Trail

All webhook processing is logged in `audit_logs` for compliance:

```sql
-- View webhook processing history (last 50 events)
SELECT 
  createdAt, 
  action, 
  metadata->'webhookId' as webhookId,
  metadata->'eventType' as eventType,
  metadata->'status' as status
FROM audit_logs
WHERE action LIKE '%WEBHOOK%' OR action LIKE '%PAYMENT%'
ORDER BY createdAt DESC
LIMIT 50;

-- Alert if webhook failure rate is high
SELECT 
  DATE(createdAt),
  COUNT(*) as total_webhooks,
  COUNT(CASE WHEN metadata->>'status' = 'failed' THEN 1 END) as failures
FROM audit_logs
WHERE action = 'PAYMENT_WEBHOOK_RECEIVED'
  AND createdAt > NOW() - INTERVAL '24 hours'
GROUP BY DATE(createdAt);
```

---

## Operational Guide for Platform Admins

The platform administrator can monitor and manage the onboarding of new clinics through the **Pagamentos** dashboard.

### Monitoring Onboardings

1.  Access **Painel da plataforma** -> **Pagamentos**.
2.  Use filters to find onboardings by:
    *   **Status**: Follow the lifecycle from `INITIATED` to `ONBOARDING_COMPLETED`.
    *   **Search**: Find by clinic name or responsible email.

### Handling Issues

| Status | Meaning | Action |
| --- | --- | --- |
| `ESCALATED_TO_STAFF` | User requested help or system error occurred. | Contact the clinic via the provided email/phone to complete manually. |
| `AWAITING_PAYMENT` | User reached checkout but hasn't paid yet. | Monitor if it stays too long (>48h). Can lead to expiration. |
| `PAID` | Payment confirmed but clinic setup failed. | Check backend logs for errors in `Tenant` creation. |
| `EXPIRED` | Onboarding took too long. | Clean up manually or ignore. User must start fresh. |

### Manual Recovery / Force Confirmation

If a payment is confirmed in the Stripe Dashboard but the onboarding status remains `AWAITING_PAYMENT` (due to webhook failure), follow the **Manual Payment Recovery** section above using the `paymentReference` or `sessionId`.

---

## Security Considerations

- **Never commit secrets:** Use environment variables only; add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to `.gitignore`
- **Webhook validation:** Always verify Stripe signature using `verifyWebhookSignature()` before processing (implemented in `stripe-payment.adapter.ts`)
- **PCI Compliance:** Stripe handles all card data; OperaClinic never stores card numbers or sensitive details
- **Webhook rotation:** Rotate signing secrets every 90 days minimum to reduce compromise exposure
- **Escalation path:** Manual override endpoint `/escalate-to-staff` ensures handoff to human if payment system fails (non-negotiable requirement)
- **Rate limiting:** All commercial endpoints have rate limits to prevent abuse (see Rate Limiting section)
- **TTL enforcement:** Onboarding tokens expire after `COMMERCIAL_ONBOARDING_TTL_HOURS` (default 48 hours) to limit exposure window
- **Audit logging:** All payment events logged for compliance and troubleshooting
- **Network security:** Webhook endpoint must be HTTPS only in production; disable HTTP

## Support & Resources

- [Stripe Documentation](https://stripe.com/docs)
- [Stripe API Reference](https://stripe.com/docs/api)
- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [Webhook Events](https://stripe.com/docs/api/events)

## Next Steps

1. ✅ Add Stripe keys to `.env`
2. ✅ Set up Stripe CLI for local testing (optional)
3. ✅ Run E2E tests to verify integration
4. ✅ Deploy payment adapter to staging
5. ✅ Monitor webhooks in Stripe Dashboard
