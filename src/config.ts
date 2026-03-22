const dev = import.meta.env.DEV;

export const API_URL = dev
  ? "http://localhost:8000"
  : "https://api.pdf.nakul.one";

export const GOOGLE_CLIENT_ID =
  "806103337602-hcnqfkas1omegp948hh7ueiqms9lae10.apps.googleusercontent.com";

export const STRIPE_MONTHLY_PRICE_ID = dev
  ? "price_1Rc30EIqYyoxeijHN9t62Ssz"
  : "price_1ReeIwEydmOwWPj6waSmQXnW";

export const STRIPE_YEARLY_PRICE_ID = dev
  ? "price_1Rc30EIqYyoxeijHdMeOE0r4"
  : "price_1ReeJZEydmOwWPj6xbTWjFnL";
