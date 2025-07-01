import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../contexts/AuthContext";

const TickMark = () => (
  <svg
    className="w-5 h-5 text-main-300 flex-shrink-0 mt-1 md:mt-0"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
      clipRule="evenodd"
    />
  </svg>
);

export function LandingPage() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen w-full bg-black text-white flex items-center justify-center px-4 md:px-8 lg:px-20 py-8">
      <div className="max-w-8xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-4 items-center">
        {/* Left side content */}
        <div className="p-6 md:p-8 rounded-3xl backdrop-blur-xl shadow-2xl flex flex-col h-full gap-8 md:gap-16 text-center md:text-left">
          {/* Header */}
          <div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-4 tracking-tight">
              <span className="text-accent-300">PDF</span>{" "}
              <span className="text-accent-50">Buddy</span>
            </h1>
            <p className="text-lg md:text-xl text-accent-50">
              No research paper is too complex with our{" "}
              <span className="text-accent-300">interactive AI-powered</span>{" "}
              PDF viewer.
            </p>
          </div>

          {/* Features & Benefits */}
          <div className="text-center md:text-left">
            <div className="mb-6 p-3 bg-accent-900/50 border border-accent-800 rounded-xl text-sm md:text-base">
              <p className="text-gray-400">
                <span className="font-semibold text-gray-300">
                  ⁉️ Not so fun fact:
                </span>{" "}
                Claude and ChatGPT incorrectly parse LaTeX equations and
                completely ignore figures in PDFs.
              </p>
            </div>
            <p className="text-lg md:text-xl font-semibold text-gray-200 mb-4">
              You deserve more than a simple text extractor.
            </p>
            <ul className="space-y-3 text-gray-400 text-sm md:text-base">
              <li className="flex items-start md:items-center justify-center md:justify-start gap-2">
                <TickMark />
                <span>
                  Unlike ChatGPT, we{" "}
                  <span className="text-gray-300 font-medium">
                    correctly interpret figures and LaTeX equations.
                  </span>
                </span>
              </li>
              <li className="flex items-start md:items-center justify-center md:justify-start gap-2">
                <TickMark />
                <span>
                  Enjoy a{" "}
                  <span className="text-gray-300 font-medium">
                    truly interactive interface
                  </span>
                  , no more copy-pasting.
                </span>
              </li>
              <li className="flex items-start md:items-center justify-center md:justify-start gap-2">
                <TickMark />
                <span>
                  Your conversation{" "}
                  <span className="text-gray-300 font-medium">
                    never loses context
                  </span>{" "}
                  or gets cut short.
                </span>
              </li>
            </ul>
          </div>

          {/* Call to Action */}
          <div className="flex flex-col bg-accent-950 border-dashed items-center justify-center px-4 py-8 md:py-12 border-2 border-accent-800 rounded-2xl">
            <span className="text-white text-lg md:text-xl font-semibold text-center mb-4">
              Sign in to Get Started
            </span>
            <p className="text-sm md:text-base text-gray-400 text-center mb-6">
              Create an account or log in to upload and chat with your
              documents.
            </p>
            <GoogleLogin
              onSuccess={login}
              onError={() => console.log("Login Failed")}
            />
          </div>
        </div>

        {/* Right side image - hidden on small screens */}
        <div className="hidden md:block w-full h-full">
          <a
            href="https://www.producthunt.com/products/pdf-buddy?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-pdf&#0045;buddy"
            target="_blank"
          >
            <img
              src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=986805&theme=light&t=1751407673371"
              alt="PDF&#0032;Buddy - An&#0032;interactive&#0032;AI&#0045;powered&#0032;PDF&#0032;reader | Product Hunt"
              style={{ width: "250px", height: " 54px" }}
              width="250"
              height="54"
            />
          </a>
          <img
            src="./bg.png"
            alt="Hero Visual"
            className="rounded-3xl w-full h-full object-cover shadow-xl"
          />
        </div>
      </div>
    </div>
  );
}
