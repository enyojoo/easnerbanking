import type { Appearance } from "@stripe/stripe-js"

/**
 * Easner Checkout SDK v1 (`https://js.easner.com/checkout.js`).
 *
 * The script is generated from this module so the platform Stripe key and config
 * endpoint can be injected per environment, while the whole body stays in one
 * reviewed, tested place. Public surface:
 *
 *   EasnerCheckout.version
 *   EasnerCheckout.mount(target, options)  → Promise<controller>   (inline)
 *   EasnerCheckout.open(options)           → Promise<controller>   (overlay)
 *
 * options: { publishableKey, clientSecret, appearance?, customerEmail?,
 *            customerName?, onSuccess?, onError?, onClose? (overlay) }
 *
 * The publishable key is real: the SDK exchanges it for config (branding, the
 * processing key, domain check) and refuses to render when the platform refuses
 * the key. Wallets (Apple Pay / Google Pay etc.) render when available.
 */
export const CHECKOUT_SDK_VERSION = "1.0.0"

export type CheckoutSdkBuildInput = {
  /** Platform processing key used only if the config endpoint is unreachable. */
  fallbackStripeKey: string
  /** Absolute URL of /api/v1/checkout/embed-config. */
  configUrl: string
  /** Appearance used when config is unavailable. */
  defaultAppearance: Appearance
  /** "Pay with card, bank debit…" hint copy. */
  methodsHint: string
}

export function buildCheckoutSdkScript(input: CheckoutSdkBuildInput): string {
  return `(function () {
  "use strict";
  var VERSION = ${JSON.stringify(CHECKOUT_SDK_VERSION)};
  if (window.EasnerCheckout && window.EasnerCheckout.version === VERSION) return;

  var FALLBACK_STRIPE_KEY = ${JSON.stringify(input.fallbackStripeKey)};
  var CONFIG_URL = ${JSON.stringify(input.configUrl)};
  var DEFAULT_APPEARANCE = ${JSON.stringify(input.defaultAppearance)};
  var METHODS_HINT = ${JSON.stringify(input.methodsHint)};
  var STRIPE_SDK_URL = "https://js.stripe.com/basil/stripe.js";
  var EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

  var stripeSdkPromise = null;
  function loadStripeSdk() {
    if (stripeSdkPromise) return stripeSdkPromise;
    stripeSdkPromise = new Promise(function (resolve, reject) {
      if (window.Stripe) { resolve(window.Stripe); return; }
      var existing = document.querySelector('script[src="' + STRIPE_SDK_URL + '"]');
      var script = existing || document.createElement("script");
      var done = function () {
        if (window.Stripe) resolve(window.Stripe);
        else reject(new Error("Easner Checkout failed to load"));
      };
      script.addEventListener("load", done);
      script.addEventListener("error", function () {
        stripeSdkPromise = null;
        reject(new Error("Easner Checkout failed to load"));
      });
      if (!existing) {
        script.src = STRIPE_SDK_URL;
        script.async = true;
        document.head.appendChild(script);
      } else if (window.Stripe) {
        done();
      }
    });
    return stripeSdkPromise;
  }

  /**
   * Exchange the merchant publishable key for config. An HTTP rejection (bad or
   * revoked key, domain not allowed, live disabled) is fatal; a network failure
   * degrades to the built-in defaults so checkout keeps working.
   */
  function fetchEmbedConfig(publishableKey) {
    return fetch(CONFIG_URL + "?key=" + encodeURIComponent(publishableKey), {
      credentials: "omit",
    }).then(
      function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (res.ok && body && body.valid) return body;
          var error = new Error((body && body.error) || "Easner Checkout: this publishable key was refused");
          error.code = (body && body.code) || "config_refused";
          error.fatal = true;
          throw error;
        });
      },
      function () { return null; }
    );
  }

  function css(el, styles) {
    for (var key in styles) { if (Object.prototype.hasOwnProperty.call(styles, key)) el.style[key] = styles[key]; }
    return el;
  }

  function resolveElement(target) {
    if (typeof target === "string") return document.querySelector(target);
    return target || null;
  }

  function themeFrom(config) {
    var button = (config && config.button) || {};
    return {
      buttonBackground: button.background || "#0080cc",
      buttonColor: button.color || "#ffffff",
      radius: button.radius || "9999px",
      muted: "#6F756F",
      border: "#D6D9D6",
      danger: "#7a2e2e",
      success: "#1a7f4e"
    };
  }

  function renderSurface(container, theme, collectEmail, prefillEmail) {
    var root = document.createElement("div");
    root.className = "easner-checkout";
    css(root, { fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" });

    var form = document.createElement("form");
    form.setAttribute("novalidate", "novalidate");

    var hint = document.createElement("p");
    hint.textContent = METHODS_HINT;
    css(hint, { margin: "0 0 12px", fontSize: "14px", lineHeight: "1.45", color: theme.muted });
    form.appendChild(hint);

    var emailInput = null;
    if (collectEmail) {
      var emailLabel = document.createElement("label");
      emailLabel.textContent = "Email";
      emailLabel.setAttribute("for", "easner-payer-email");
      css(emailLabel, { display: "block", margin: "0 0 6px", fontSize: "14px", fontWeight: "500" });
      emailInput = document.createElement("input");
      emailInput.id = "easner-payer-email";
      emailInput.type = "email";
      emailInput.autocomplete = "email";
      emailInput.placeholder = "you@example.com";
      emailInput.required = true;
      if (prefillEmail) emailInput.value = prefillEmail;
      css(emailInput, {
        width: "100%", boxSizing: "border-box", height: "48px", margin: "0 0 16px",
        padding: "0 16px", border: "1px solid " + theme.border, borderRadius: theme.radius,
        fontSize: "15px", outline: "none"
      });
      emailInput.addEventListener("focus", function () { emailInput.style.borderColor = theme.buttonBackground; });
      emailInput.addEventListener("blur", function () { emailInput.style.borderColor = theme.border; });
      form.appendChild(emailLabel);
      form.appendChild(emailInput);
    }

    var expressMount = document.createElement("div");
    var divider = css(document.createElement("div"), {
      display: "none", alignItems: "center", gap: "12px", margin: "14px 0", color: theme.muted,
      fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em"
    });
    var line1 = css(document.createElement("span"), { flex: "1", borderTop: "1px solid " + theme.border });
    var dividerText = document.createElement("span");
    dividerText.textContent = "Or pay with";
    var line2 = css(document.createElement("span"), { flex: "1", borderTop: "1px solid " + theme.border });
    divider.appendChild(line1); divider.appendChild(dividerText); divider.appendChild(line2);

    var paymentMount = document.createElement("div");
    var message = document.createElement("p");
    message.setAttribute("role", "alert");
    css(message, { display: "none", margin: "12px 0 0", fontSize: "14px", color: theme.danger });

    var button = document.createElement("button");
    button.type = "submit";
    button.disabled = true;
    css(button, {
      width: "100%", boxSizing: "border-box", height: "48px", marginTop: "16px", border: "none",
      borderRadius: theme.radius, background: theme.buttonBackground, color: theme.buttonColor,
      fontSize: "16px", fontWeight: "600", cursor: "pointer", opacity: "0.6",
      transition: "opacity 120ms ease"
    });
    button.textContent = "Pay";

    form.appendChild(expressMount);
    form.appendChild(divider);
    form.appendChild(paymentMount);
    form.appendChild(message);
    form.appendChild(button);
    root.appendChild(form);

    // Replace only what this SDK rendered before – never the merchant's markup.
    if (container.__easnerRoot && container.__easnerRoot.parentNode === container) {
      container.removeChild(container.__easnerRoot);
    }
    container.appendChild(root);
    container.__easnerRoot = root;

    return {
      root: root, form: form, emailInput: emailInput, expressMount: expressMount,
      divider: divider, paymentMount: paymentMount, message: message, button: button
    };
  }

  function showMessage(refs, text) {
    refs.message.textContent = text;
    refs.message.style.display = "block";
  }
  function clearMessage(refs) {
    refs.message.textContent = "";
    refs.message.style.display = "none";
  }
  function setButtonEnabled(refs, enabled) {
    refs.button.disabled = !enabled;
    refs.button.style.opacity = enabled ? "1" : "0.6";
    refs.button.style.cursor = enabled ? "pointer" : "default";
  }
  function setSubmitting(refs, submitting, label) {
    if (submitting) {
      refs.button.__label = refs.button.textContent;
      refs.button.textContent = "Processing…";
      setButtonEnabled(refs, false);
    } else {
      refs.button.textContent = label || refs.button.__label || "Pay";
      setButtonEnabled(refs, true);
    }
  }
  function showSuccess(refs, theme, businessName) {
    var notice = document.createElement("div");
    css(notice, {
      border: "1px solid " + theme.border, borderRadius: "16px", padding: "18px",
      display: "flex", gap: "12px", alignItems: "flex-start"
    });
    var mark = document.createElement("div");
    mark.textContent = "✓";
    css(mark, {
      width: "36px", height: "36px", borderRadius: "9999px", background: theme.success,
      color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "18px", flexShrink: "0"
    });
    var textWrap = document.createElement("div");
    var title = document.createElement("p");
    title.textContent = "Payment received";
    css(title, { margin: "0 0 4px", fontSize: "14px", fontWeight: "600" });
    var body = document.createElement("p");
    body.textContent = (businessName ? businessName + " has" : "We have") + " been notified of your payment.";
    css(body, { margin: "0", fontSize: "14px", color: theme.muted });
    textWrap.appendChild(title); textWrap.appendChild(body);
    notice.appendChild(mark); notice.appendChild(textWrap);
    refs.form.style.display = "none";
    refs.root.appendChild(notice);
  }

  function sessionEmailOf(checkout) {
    try {
      var session = typeof checkout.session === "function" ? checkout.session() : {};
      return String(
        (checkout && checkout.email) ||
        (session && session.email) ||
        (session && session.customerEmail) ||
        (session && session.customerDetails && session.customerDetails.email) ||
        ""
      ).trim();
    } catch (e) { return ""; }
  }

  function payLabelOf(checkout) {
    try {
      var total = checkout.session().total;
      if (total && total.total && total.total.amount) return "Pay " + total.total.amount;
    } catch (e) { /* fall through */ }
    return "Pay";
  }

  function mountInternal(el, opts) {
    if (!el) return Promise.reject(new Error("Easner Checkout: mount target not found"));
    if (!opts.publishableKey || String(opts.publishableKey).indexOf("easner_pk_") !== 0) {
      return Promise.reject(new Error("Easner Checkout: publishableKey is required"));
    }
    if (!opts.clientSecret) {
      return Promise.reject(new Error("Easner Checkout: clientSecret is required"));
    }

    var mountEmail = String(opts.customerEmail || "").trim();
    var mountName = String(opts.customerName || "").trim();

    return fetchEmbedConfig(String(opts.publishableKey)).then(function (config) {
      return loadStripeSdk().then(function (StripeCtor) {
        var stripe = StripeCtor((config && config.stripe_publishable_key) || FALLBACK_STRIPE_KEY);
        var theme = themeFrom(config);
        var appearance = opts.appearance || (config && config.appearance) || DEFAULT_APPEARANCE;
        var businessName = (config && config.business_name) || "";

        var initOptions = {
          fetchClientSecret: function () { return Promise.resolve(opts.clientSecret); },
          elementsOptions: { appearance: appearance }
        };
        if (mountName) initOptions.defaultValues = { billingAddress: { name: mountName } };

        return stripe.initCheckout(initOptions).then(function (checkout) {
          var knownEmail = mountEmail || sessionEmailOf(checkout);
          var refs = renderSurface(el, theme, !knownEmail, "");
          var destroyed = false;

          var payment = checkout.createPaymentElement({
            fields: {
              billingDetails: { name: "always", email: "never" },
              card: { billingDetails: { name: "always", email: "never" } }
            }
          });
          payment.mount(refs.paymentMount);
          payment.on("ready", function () {
            if (destroyed) return;
            refs.button.textContent = payLabelOf(checkout);
            setButtonEnabled(refs, true);
          });

          var express = null;
          try {
            if (typeof checkout.createExpressCheckoutElement === "function") {
              express = checkout.createExpressCheckoutElement();
              express.mount(refs.expressMount);
              express.on("ready", function (event) {
                if (destroyed) return;
                var methods = event && event.availablePaymentMethods;
                var hasWallets = false;
                for (var key in methods) {
                  if (Object.prototype.hasOwnProperty.call(methods, key) && methods[key]) hasWallets = true;
                }
                refs.divider.style.display = hasWallets ? "flex" : "none";
              });
              express.on("confirm", function (event) {
                var walletEmail = String(
                  (event && event.billingDetails && event.billingDetails.email) || ""
                ).trim();
                confirmPayment(walletEmail).then(function (result) {
                  if (result && !result.ok && event && typeof event.paymentFailed === "function") {
                    event.paymentFailed({ reason: "fail" });
                  }
                }, function () {
                  if (event && typeof event.paymentFailed === "function") {
                    event.paymentFailed({ reason: "fail" });
                  }
                });
              });
            }
          } catch (e) { express = null; }

          function confirmPayment(overrideEmail) {
            var sessionEmail = sessionEmailOf(checkout);
            var emailLocked = Boolean(sessionEmail);
            var formEmail = refs.emailInput ? String(refs.emailInput.value || "").trim() : "";
            var payerEmail = (overrideEmail || formEmail || knownEmail || sessionEmail).trim();
            if (!EMAIL_RE.test(payerEmail)) {
              showMessage(refs, "Enter your email to continue");
              return Promise.resolve({ ok: false });
            }
            clearMessage(refs);
            setSubmitting(refs, true);

            var updated =
              !emailLocked && typeof checkout.updateEmail === "function"
                ? checkout.updateEmail(payerEmail).then(function () {}, function () {})
                : Promise.resolve();

            return updated
              .then(function () {
                var confirmOptions = {};
                if (typeof opts.onSuccess === "function") confirmOptions.redirect = "if_required";
                if (!emailLocked) confirmOptions.email = payerEmail;
                return checkout.confirm(confirmOptions);
              })
              .then(function (result) {
                if (result && result.type === "error") {
                  throw new Error((result.error && result.error.message) || "Payment failed");
                }
                if (typeof opts.onSuccess === "function") {
                  showSuccess(refs, theme, businessName);
                  try { opts.onSuccess(result); } catch (e) { /* merchant handler */ }
                }
                return { ok: true };
              })
              .catch(function (error) {
                setSubmitting(refs, false, payLabelOf(checkout));
                showMessage(refs, (error && error.message) || "Payment failed");
                if (typeof opts.onError === "function") {
                  try { opts.onError(error); } catch (e) { /* merchant handler */ }
                }
                return { ok: false };
              });
          }

          refs.form.addEventListener("submit", function (event) {
            event.preventDefault();
            confirmPayment("");
          });

          var controller = {
            version: VERSION,
            checkout: checkout,
            unmount: function () {
              if (destroyed) return;
              destroyed = true;
              try { payment.unmount(); } catch (e) { /* already gone */ }
              if (express) { try { express.unmount(); } catch (e) { /* already gone */ } }
              if (refs.root.parentNode) refs.root.parentNode.removeChild(refs.root);
              if (el.__easnerRoot === refs.root) el.__easnerRoot = null;
            }
          };
          return controller;
        });
      });
    });
  }

  function openOverlay(opts) {
    var options = opts || {};
    var backdrop = css(document.createElement("div"), {
      position: "fixed", inset: "0", zIndex: "2147483000",
      background: "rgba(18, 21, 24, 0.55)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: "16px",
      overflowY: "auto"
    });
    var card = css(document.createElement("div"), {
      background: "#ffffff", borderRadius: "20px", padding: "24px",
      width: "100%", maxWidth: "420px", maxHeight: "calc(100vh - 32px)",
      overflowY: "auto", boxShadow: "0 24px 64px rgba(18, 21, 24, 0.24)",
      position: "relative"
    });
    var close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Close checkout");
    close.textContent = "\\u00d7";
    css(close, {
      position: "absolute", top: "12px", right: "12px", width: "32px", height: "32px",
      borderRadius: "9999px", border: "none", background: "transparent",
      fontSize: "22px", lineHeight: "1", cursor: "pointer", color: "#6F756F"
    });
    var mountPoint = css(document.createElement("div"), { marginTop: "12px" });
    card.appendChild(close);
    card.appendChild(mountPoint);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    var priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    var controllerRef = { current: null };
    var closed = false;
    function closeOverlay() {
      if (closed) return;
      closed = true;
      if (controllerRef.current) controllerRef.current.unmount();
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.body.style.overflow = priorOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (typeof options.onClose === "function") {
        try { options.onClose(); } catch (e) { /* merchant handler */ }
      }
    }
    function onKeyDown(event) { if (event.key === "Escape") closeOverlay(); }
    close.addEventListener("click", closeOverlay);
    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop && options.closeOnBackdrop !== false) closeOverlay();
    });
    document.addEventListener("keydown", onKeyDown);

    return mountInternal(mountPoint, options).then(
      function (controller) {
        controllerRef.current = controller;
        controller.close = closeOverlay;
        return controller;
      },
      function (error) {
        closeOverlay();
        throw error;
      }
    );
  }

  window.EasnerCheckout = {
    version: VERSION,
    mount: function (target, options) {
      return mountInternal(resolveElement(target), options || {});
    },
    open: openOverlay
  };
})();
`
}
