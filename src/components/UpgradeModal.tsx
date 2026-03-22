import axios from "axios";
import { API_URL, STRIPE_MONTHLY_PRICE_ID as MONTHLY_PRICE_ID, STRIPE_YEARLY_PRICE_ID as YEARLY_PRICE_ID } from "../config";

interface UpgradeModalProps {
  onClose: () => void;
  token: string | null;
}

export function UpgradeModal({ onClose, token }: UpgradeModalProps) {
  const handleSubscribe = async (priceId: string) => {
    if (!token) {
      console.error("No token available for subscription");
      return;
    }
    try {
      const { data } = await axios.post(
        `${API_URL}/create-checkout-session`,
        { price_id: priceId },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // Redirect to Stripe's checkout page
      window.location.href = data.url;
    } catch (error) {
      console.error("Failed to create checkout session:", error);
      // You could show an error message to the user here
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 bg-opacity-75 flex justify-center items-center z-50 transition-opacity duration-300">
      <div className="bg-gray-800 rounded-lg p-8 shadow-2xl max-w-2xl w-full transform scale-95 hover:scale-100 transition-transform duration-300">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-white">Upgrade Your Plan</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-3xl font-light"
          >
            &times;
          </button>
        </div>
        <p className="text-gray-400 mb-8">
          You've reached your upload limit on the Free plan. To continue, please
          choose a subscription.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Monthly Plan */}
          <div className="bg-gray-700 p-6 rounded-lg border border-gray-600 flex flex-col hover:border-main-500 transition-all">
            <h3 className="text-xl font-semibold text-white">Monthly</h3>
            <p className="text-3xl font-bold text-main-400 my-4">
              £3
              <span className="text-base font-normal text-gray-400">
                /month
              </span>
            </p>
            <ul className="text-gray-300 space-y-2 mb-6 flex-grow">
              <li>✓ Unlimited PDF Uploads</li>
              <li>✓ Infinite Chats & Highlights</li>
              <li>✓ Flexible, cancel anytime</li>
            </ul>
            <button
              onClick={() => handleSubscribe(MONTHLY_PRICE_ID)}
              className="w-full bg-main-600 hover:bg-main-700 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              Choose Monthly
            </button>
          </div>

          {/* Yearly Plan */}
          <div className="bg-gray-700 p-6 rounded-lg border-2 border-accent-400 flex flex-col relative">
            <div className="absolute top-0 right-4 -mt-4 bg-accent-300 text-black text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              Best Value
            </div>
            <h3 className="text-xl font-semibold text-white">Yearly</h3>
            <p className="text-3xl font-bold text-accent-300 my-4">
              £12
              <span className="text-base font-normal text-gray-400">/year</span>
            </p>
            <ul className="text-gray-300 space-y-2 mb-6 flex-grow">
              <li>✓ All benefits of Monthly</li>
              <li>✓ Save 66% - like getting 8 months free!</li>
            </ul>
            <button
              onClick={() => handleSubscribe(YEARLY_PRICE_ID)}
              className="w-full bg-accent-300 hover:bg-accent-400 text-black font-bold py-2 px-4 rounded transition-colors"
            >
              Choose Yearly
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
