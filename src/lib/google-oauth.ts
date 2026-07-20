import axios from "axios";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;

export function getGoogleAuthUrl(): string {
  const base = "https://accounts.google.com/o/oauth2/v2/auth";
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
  });
  return `${base}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const response = await axios.post(
    "https://oauth2.googleapis.com/token",
    {
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    },
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  );
  return response.data;
}

export async function getGoogleUserInfo(accessToken: string) {
  const response = await axios.get(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  return response.data;
}

// export const getGoogleAuthUrl = () => {
//   const clientId = process.env.GOOGLE_CLIENT_ID;
//   const redirectUri = process.env.GOOGLE_REDIRECT_URI;
//   if (!clientId || !redirectUri) {
//     throw new Error("Google OAuth configuration missing");
//   }

//   const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
//   url.searchParams.append("client_id", clientId);
//   url.searchParams.append("redirect_uri", redirectUri);
//   url.searchParams.append("response_type", "code");
//   url.searchParams.append("scope", "email profile");
//   url.searchParams.append("access_type", "offline");
//   url.searchParams.append("prompt", "consent");

//   return url.toString();
// };

// export const exchangeCodeForTokens = async (code: string) => {
//   const clientId = process.env.GOOGLE_CLIENT_ID;
//   const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
//   const redirectUri = process.env.GOOGLE_REDIRECT_URI;

//   if (!clientId || !clientSecret || !redirectUri) {
//     throw new Error("Google OAuth configuration missing");
//   }

//   const response = await fetch("https://oauth2.googleapis.com/token", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/x-www-form-urlencoded",
//     },
//     body: new URLSearchParams({
//       client_id: clientId,
//       client_secret: clientSecret,
//       code,
//       redirect_uri: redirectUri,
//       grant_type: "authorization_code",
//     }),
//   });

//   if (!response.ok) {
//     const errorData = await response.json();
//     throw new Error(`Failed to exchange code for tokens: ${JSON.stringify(errorData)}`);
//   }

//   return response.json();
// };

// export const getGoogleUserInfo = async (accessToken: string) => {
//   const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
//     headers: {
//       Authorization: `Bearer ${accessToken}`,
//     },
//   });

//   if (!response.ok) {
//     const errorData = await response.json();
//     throw new Error(`Failed to fetch user info: ${JSON.stringify(errorData)}`);
//   }

//   return response.json() as Promise<{
//     id: string;
//     email: string;
//     verified_email: boolean;
//     name: string;
//     given_name: string;
//     family_name: string;
//     picture: string;
//   }>;
// };
