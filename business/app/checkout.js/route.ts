import { getStripePublishableKey } from "@/lib/stripe/config"
import { onlinePaymentTabHint } from "@/lib/invoices/invoice-payment-copy"
import { easnerStripeElementsAppearance } from "@/lib/stripe/elements-appearance"

/**
 * Embed script served at /checkout.js (js.easner.com points here).
 *
 * `EasnerCheckout.mount(el, { publishableKey, clientSecret, appearance? })` renders the
 * card and bank fields inside the merchant's own page. The merchant only ever handles
 * their `easner_pk_*` key and a session client secret; the processing keys and account
 * ids stay on the platform, which is why this asset is generated per request.
 */
export async function GET() {
  const platformKey = getStripePublishableKey()
  const defaultAppearance = easnerStripeElementsAppearance()

  const script = `(function () {
  "use strict";
  var PLATFORM_KEY = ${JSON.stringify(platformKey)};
  var SDK_URL = "https://js.stripe.com/basil/stripe.js";

  function loadSdk() {
    if (window.__easnerSdkPromise) return window.__easnerSdkPromise;
    window.__easnerSdkPromise = new Promise(function (resolve, reject) {
      if (window.Stripe) {
        resolve(window.Stripe(PLATFORM_KEY));
        return;
      }
      var script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.onload = function () {
        if (!window.Stripe) {
          reject(new Error("Easner Checkout failed to load"));
          return;
        }
        resolve(window.Stripe(PLATFORM_KEY));
      };
      script.onerror = function () {
        reject(new Error("Easner Checkout failed to load"));
      };
      document.head.appendChild(script);
    });
    return window.__easnerSdkPromise;
  }

  function resolveElement(target) {
    if (typeof target === "string") return document.querySelector(target);
    return target;
  }

  var EasnerCheckout = {
    /**
     * @param {string|Element} target  mount point, e.g. "#easner-checkout"
     * @param {{ publishableKey: string, clientSecret: string, appearance?: object,
     *           customerEmail?: string, customerName?: string,
     *           onSuccess?: function, onError?: function }} options
     */
    mount: function (target, options) {
      var el = resolveElement(target);
      var opts = options || {};
      if (!el) return Promise.reject(new Error("Easner Checkout: mount target not found"));
      if (!opts.publishableKey || String(opts.publishableKey).indexOf("easner_pk_") !== 0) {
        return Promise.reject(new Error("Easner Checkout: publishableKey is required"));
      }
      if (!opts.clientSecret) {
        return Promise.reject(new Error("Easner Checkout: clientSecret is required"));
      }

      return loadSdk().then(function (sdk) {
        var mountEmail = String(opts.customerEmail || "").trim();
        var mountName = String(opts.customerName || "").trim();
        var initOptions = {
          fetchClientSecret: function () {
            return Promise.resolve(opts.clientSecret);
          },
          elementsOptions: {
            appearance: opts.appearance || ${JSON.stringify(defaultAppearance)},
          },
        };
        // Prefill via initCheckout – createPaymentElement rejects options.defaultValues.
        if (mountName || mountEmail) {
          initOptions.defaultValues = {};
          if (mountEmail) initOptions.defaultValues.email = mountEmail;
          if (mountName) initOptions.defaultValues.billingAddress = { name: mountName };
        }
        return sdk
          .initCheckout(initOptions)
          .then(function (checkout) {
            var session = typeof checkout.session === "function" ? checkout.session() : {};
            var sessionEmail = String(
              (session && session.customerEmail) ||
                (session && session.customerDetails && session.customerDetails.email) ||
                ""
            ).trim();
            var knownEmail = mountEmail || sessionEmail;
            var hint = document.createElement("p");
            hint.textContent = ${JSON.stringify(onlinePaymentTabHint())};
            hint.style.margin = "0 0 12px";
            hint.style.fontSize = "14px";
            hint.style.lineHeight = "1.45";
            hint.style.color = "#6F756F";
            var emailLabel = document.createElement("label");
            emailLabel.textContent = ${JSON.stringify("Email")};
            emailLabel.setAttribute("for", "easner-payer-email");
            emailLabel.style.display = "block";
            emailLabel.style.margin = "0 0 6px";
            emailLabel.style.fontSize = "14px";
            emailLabel.style.fontWeight = "500";
            var emailInput = document.createElement("input");
            emailInput.id = "easner-payer-email";
            emailInput.type = "email";
            emailInput.autocomplete = "email";
            emailInput.placeholder = ${JSON.stringify("you@example.com")};
            emailInput.required = true;
            emailInput.style.width = "100%";
            emailInput.style.boxSizing = "border-box";
            emailInput.style.height = "48px";
            emailInput.style.margin = "0 0 16px";
            emailInput.style.padding = "0 16px";
            emailInput.style.border = "1px solid #D6D9D6";
            emailInput.style.borderRadius = "100px";
            emailInput.style.fontSize = "15px";
            var form = document.createElement("form");
            form.setAttribute("novalidate", "novalidate");
            var mountPoint = document.createElement("div");
            var button = document.createElement("button");
            button.type = "submit";
            button.textContent = "Pay " + checkout.session().total.total.amount;
            var message = document.createElement("p");
            message.setAttribute("role", "alert");
            message.style.display = "none";

            form.appendChild(hint);
            if (!knownEmail) {
              form.appendChild(emailLabel);
              form.appendChild(emailInput);
            }
            form.appendChild(mountPoint);
            form.appendChild(message);
            form.appendChild(button);
            el.innerHTML = "";
            el.appendChild(form);

            var payment = checkout.createPaymentElement({
              fields: {
                billingDetails: { name: "always", email: "never" },
                card: { billingDetails: { name: "always", email: "never" } },
              },
            });
            payment.mount(mountPoint);

            form.addEventListener("submit", function (event) {
              event.preventDefault();
              var email = knownEmail || String(emailInput.value || "").trim();
              if (!email || email.indexOf("@") < 1) {
                message.textContent = ${JSON.stringify("Enter your email to continue")};
                message.style.display = "block";
                return;
              }
              button.disabled = true;
              message.style.display = "none";
              var sessionEmail = String(
                (typeof checkout.session === "function" && checkout.session().email) ||
                  (checkout.email) ||
                  ""
              ).trim();
              // Session already has customer_email – do not call updateEmail / confirm email.
              var confirm = function () {
                return sessionEmail
                  ? checkout.confirm({})
                  : checkout.confirm({ email: email });
              };
              var pending =
                !sessionEmail && typeof checkout.updateEmail === "function"
                  ? checkout.updateEmail(email).then(confirm, confirm)
                  : confirm();
              pending
                .then(function (result) {
                  if (result.type === "error") {
                    throw new Error(result.error.message || "Payment failed");
                  }
                  if (typeof opts.onSuccess === "function") opts.onSuccess(result);
                })
                .catch(function (error) {
                  button.disabled = false;
                  message.textContent = error.message || "Payment failed";
                  message.style.display = "block";
                  if (typeof opts.onError === "function") opts.onError(error);
                });
            });

            return checkout;
          });
      });
    },
  };

  window.EasnerCheckout = EasnerCheckout;
})();
`

  return new Response(script, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  })
}
