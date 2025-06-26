declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_API_URL: string;
  readonly VITE_STRIPE_YEARLY_PRICE_ID: string;
  readonly VITE_STRIPE_MONTHLY_PRICE_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
