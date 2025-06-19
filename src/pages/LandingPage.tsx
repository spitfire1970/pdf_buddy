import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../contexts/AuthContext";

export function LandingPage() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen w-full bg-black text-white flex items-center justify-center px-4 py-12">
      <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div className="p-8 bg-black/60 border border-gray-700 rounded-3xl backdrop-blur-xl shadow-2xl">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">
            <span className="text-accent">PDF</span> Buddy
          </h1>
          <p className="text-lg text-gray-300 mb-8">
            No research paper is too complex.
            <span className="text-accent"> Talk </span>to it. Read it like you
            wrote it.
          </p>

          <div className="flex flex-col items-center justify-center px-8 py-14 border-2 border-dashed border-gray-600 rounded-2xl">
            <span className="text-white text-lg font-semibold text-center mb-4">
              Sign in to Get Started
            </span>
            <p className="text-sm text-gray-400 text-center mb-6">
              Create an account or log in to upload and chat with your
              documents.
            </p>
            <GoogleLogin
              onSuccess={login}
              onError={() => console.log("Login Failed")}
            />
          </div>

          <div className="mt-8 text-center">
            <div className="mb-6 p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-sm">
              <p className="text-gray-400">
                <span className="font-semibold text-gray-300">
                  ⁉️ Not so fun fact:
                </span>{" "}
                Claude and ChatGPT parse LaTeX equations incorrectly and
                completely ignore figures in PDFs.
              </p>
            </div>
            <p className="text-lg font-semibold text-gray-200 mb-4">
              You deserve better than a simple text extractor.
            </p>
            <ul className="space-y-3 text-gray-400 text-sm">
              <li className="flex items-start md:items-center justify-center gap-2">
                <svg
                  className="w-4 h-4 text-accent flex-shrink-0 mt-1 md:mt-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  Unlike ChatGPT, we{" "}
                  <span className="text-gray-300 font-medium">
                    correctly interpret figures and LaTeX equations.
                  </span>
                </span>
              </li>
              <li className="flex items-start md:items-center justify-center gap-2">
                <svg
                  className="w-4 h-4 text-accent flex-shrink-0 mt-1 md:mt-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  Enjoy a{" "}
                  <span className="text-gray-300 font-medium">
                    truly interactive interface
                  </span>
                  , no more copy-pasting.
                </span>
              </li>
              <li className="flex items-start md:items-center justify-center gap-2">
                <svg
                  className="w-4 h-4 text-accent flex-shrink-0 mt-1 md:mt-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
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
        </div>

        <div className="w-full h-full">
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
