import {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
} from "react";
import { type ReactNode } from "react";
import { type CredentialResponse } from "@react-oauth/google";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL;

interface User {
  email: string;
  name: string;
  picture: string;
  subscription_tier: "free" | "monthly" | "yearly";
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (credentialResponse: CredentialResponse) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const storedToken = localStorage.getItem("authToken");
      const storedUser = localStorage.getItem("user");
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Failed to parse user from localStorage", error);
      localStorage.clear();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (credentialResponse: CredentialResponse) => {
    if (credentialResponse.credential) {
      try {
        const res = await axios.post(`${API_URL}/auth/google`, {
          token: credentialResponse.credential,
        });
        const { access_token, user_info } = res.data;
        setToken(access_token);
        setUser(user_info);
        localStorage.setItem("authToken", access_token);
        localStorage.setItem("user", JSON.stringify(user_info));
      } catch (error) {
        console.error("Authentication failed:", error);
      }
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
  };

  const refreshUser = useCallback(async () => {
    const currentToken = localStorage.getItem("authToken");
    if (!currentToken) return; // No user to refresh

    console.log("Refreshing user data from server...");
    try {
      const { data: updatedUser } = await axios.get(`${API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      setUser(updatedUser);
      localStorage.setItem("user", JSON.stringify(updatedUser));
      console.log("User data refreshed:", updatedUser);
    } catch (error) {
      console.error("Failed to refresh user data: LOGGING USER OUT", error);
      logout();
    }
  }, []);

  const value = { user, token, login, logout, isLoading, refreshUser };

  return (
    <AuthContext.Provider value={value}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
