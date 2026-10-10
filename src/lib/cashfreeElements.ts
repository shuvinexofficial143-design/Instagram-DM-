/** Cashfree Elements: only individual secure fields, never hosted checkout. */
export type PaymentMethod = "qr" | "netbanking" | "card" | "app";
export type PaymentSession = {
  paymentSessionId: string;
  mode: string;
  orderId: string;
  paymentExpiresAt?: string;
};
export type PaymentElement = {
  mount: (selector: string) => void;
  unmount: () => void;
  on: (event: string, callback: (data: any) => void) => void;
  isComplete?: () => boolean;
  data: () => any;
};
export type ElementSdk = {
  create: (name: string, options: any) => PaymentElement;
  pay: (options: any) => Promise<any>;
};
let sdkPromise: Promise<void> | undefined;
export async function getCashfreeElements(mode: string): Promise<ElementSdk> {
  if (!["sandbox", "production"].includes(mode))
    throw new Error("Invalid payment environment.");
  if (!(window as any).Cashfree) {
    if (!sdkPromise)
      sdkPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
        script.async = true;
        const fail = () => {
          window.clearTimeout(timer);
          sdkPromise = undefined;
          script.remove();
          reject(
            new Error(
              "Secure payment fields could not load. Check your connection and try again.",
            ),
          );
        };
        const timer = window.setTimeout(fail, 15000);
        script.onload = () => {
          window.clearTimeout(timer);
          resolve();
        };
        script.onerror = fail;
        document.head.appendChild(script);
      });
    await sdkPromise;
  }
  const sdk = (window as any).Cashfree?.({ mode });
  if (!sdk?.create || !sdk?.pay)
    throw new Error(
      "Custom payment fields are unavailable. Please contact support.",
    );
  return sdk;
}
export function mountPaymentElement(
  sdk: ElementSdk,
  kind: string,
  selector: string,
  values: Record<string, unknown>,
  onChange?: () => void,
) {
  const element = sdk.create(kind, {
    values,
    style: {
      base: {
        fontSize: "18px",
        fontFamily: "Arial, sans-serif",
        color: "#0f172a",
        padding: "12px",
        borderRadius: "10px",
      },
      invalid: { color: "#b42318" },
    },
    classes: {
      base: "ar-payment-field",
      focus: "ar-payment-field-focus",
      invalid: "ar-payment-field-error",
    },
  });
  const ready = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(
      () =>
        reject(
          new Error(
            "The secure payment field took too long to load. Please try again.",
          ),
        ),
      15000,
    );
    element.on("ready", () => {
      window.clearTimeout(timer);
      resolve();
    });
    element.on("loaderror", () => {
      window.clearTimeout(timer);
      reject(
        new Error(
          "This payment method is currently unavailable. Please choose another method or contact support.",
        ),
      );
    });
    if (onChange) element.on("change", onChange);
    try {
      element.mount(selector);
    } catch (error) {
      window.clearTimeout(timer);
      reject(error);
    }
  });
  return { element, ready };
}
export async function payWithElement(
  sdk: ElementSdk,
  element: PaymentElement,
  session: PaymentSession,
  returnUrl: string,
) {
  if (
    session.paymentExpiresAt &&
    Date.parse(session.paymentExpiresAt) <= Date.now()
  )
    throw new Error(
      "This payment session has expired. Check its status before starting again.",
    );
  if (!(element.isComplete?.() ?? element.data()?.complete))
    throw new Error("Complete the payment details before continuing.");
  const result = await sdk.pay({
    paymentMethod: element,
    paymentSessionId: session.paymentSessionId,
    returnUrl,
    redirect: "if_required",
    redirectTarget: "_self",
  });
  if (result?.error)
    throw new Error(
      "Your payment could not be completed. Check payment status before trying again.",
    );
  // A SDK callback is never an entitlement; the caller verifies on the server.
  return result;
}
