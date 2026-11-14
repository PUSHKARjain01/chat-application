import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem("token");

        if (!token) {
            setLoading(false);
            return;
        }

        axios
            .get("http://localhost:500/api/auth/me", {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })
            .then((response) => {
                setUser(response.data.user);
            })
            .catch((error) => {
                console.log("Authentication failed:", error);
                localStorage.removeItem("token");
                setUser(null);
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    const login = async (email, password) => {
        const response = await axios.post(
            "http://localhost:500/api/auth/login",
            {
                email,
                password,
            }
        );

        localStorage.setItem("token", response.data.token);
        setUser(response.data.user);

        return response.data;
    };

    const register = async (name, email, password) => {
        const response = await axios.post(
            "http://localhost:500/api/auth/register",
            {
                name,
                email,
                password,
            }
        );

        return response.data;
    };

    const logout = () => {
        localStorage.removeItem("token");
        setUser(null);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                login,
                register,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);