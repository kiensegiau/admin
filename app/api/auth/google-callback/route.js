import { google } from "googleapis";
import { writeTokens } from "@/lib/tokenStorage";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
      return new Response("Missing authorization code", { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.CALLBACK_URL
    );

    // Lấy tokens từ code
    const { tokens } = await oauth2Client.getToken(code);

    // Log để debug
    console.log("Received tokens:", tokens);

    if (!tokens.refresh_token) {
      console.error("Không nhận được refresh token!");
      // Xóa credentials cũ trong Google Console
      return new Response("Không nhận được refresh token", { status: 400 });
    }

    // Lưu đầy đủ thông tin token
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      id_token: tokens.id_token,
      expiry_date: new Date().getTime() + (tokens.expires_in || 3600) * 1000,
    };

    await writeTokens(tokenData);

    // Redirect về trang chủ với thông báo thành công
    return Response.redirect(new URL("/?auth=success", request.url));
  } catch (error) {
    console.error("Lỗi trong quá trình xác thực:", error);
    return new Response(`Lỗi xác thực: ${error.message}`, { status: 500 });
  }
}
