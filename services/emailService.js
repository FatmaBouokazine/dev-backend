const { Resend } = require('resend');

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY);

// Development mode configuration
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';
const RESEND_VERIFIED_EMAIL = 'azer.idou5@gmail.com'; // Your verified email for development

class EmailService {
  constructor() {
    // Use Resend's verified testing domain for development
    this.fromEmail = process.env.FROM_EMAIL || 'Medflow <onboarding@resend.dev>';
  }

  async sendVerificationEmail(email, verificationCode, name) {
    try {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Your Email - Medflow</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #0F2854 0%, #1C4D8D 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .code { background: #fff; border: 2px solid #4988C4; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 3px; margin: 20px 0; border-radius: 5px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Medflow</h1>
            <p>Healthcare Management Platform</p>
          </div>
          <div class="content">
            <h2>Welcome to Medflow, ${name}!</h2>
            <p>Thank you for signing up. To complete your registration and secure your account, please verify your email address using the code below:</p>

            <div class="code">${verificationCode}</div>

            <p><strong>Important:</strong> This verification code will expire in 10 minutes for security reasons.</p>

            <p>If you didn't create an account with Medflow, please ignore this email.</p>

            <p>For security reasons, please do not share this code with anyone.</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Medflow. Please do not reply to this email.</p>
            <p>&copy; 2024 Medflow. All rights reserved.</p>
          </div>
        </body>
        </html>
      `;

      // In development, send to verified email if target email is different
      const recipientEmail = IS_DEVELOPMENT && email !== RESEND_VERIFIED_EMAIL ? RESEND_VERIFIED_EMAIL : email;
      
      const data = await resend.emails.send({
        from: this.fromEmail,
        to: recipientEmail,
        subject: 'Verify Your Email - Medflow',
        html: html,
      });

      if (IS_DEVELOPMENT) {
        console.log('\n📧 VERIFICATION EMAIL SENT');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📨 To: ${email}`);
        if (email !== RESEND_VERIFIED_EMAIL) {
          console.log(`⚠️  Actually sent to: ${recipientEmail} (dev mode)`);
        }
        console.log(`🔑 Verification Code: ${verificationCode}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      }
      
      console.log('✅ Verification email sent successfully');
      return { success: true, data };
    } catch (error) {
      console.error('❌ Error sending verification email:', error);
      if (IS_DEVELOPMENT) {
        console.log('\n🔑 VERIFICATION CODE (email failed):', verificationCode);
        console.log('Use this code to verify the account manually\n');
      }
      return { success: false, error: error.message };
    }
  }

  async sendPasswordResetEmail(email, resetToken, name) {
    try {
      const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password - Medflow</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #0F2854 0%, #1C4D8D 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #4988C4; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Medflow</h1>
            <p>Healthcare Management Platform</p>
          </div>
          <div class="content">
            <h2>Password Reset Request</h2>
            <p>Hello ${name},</p>
            <p>We received a request to reset your password for your Medflow account. If you made this request, click the button below to reset your password:</p>

            <a href="${resetLink}" class="button">Reset Password</a>

            <p><strong>This link will expire in 1 hour for security reasons.</strong></p>

            <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>

            <p>For security reasons, please do not share this link with anyone.</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Medflow. Please do not reply to this email.</p>
            <p>&copy; 2024 Medflow. All rights reserved.</p>
          </div>
        </body>
        </html>
      `;

      const data = await resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: 'Reset Your Password - Medflow',
        html: html,
      });

      console.log('Password reset email sent successfully:', data);
      return { success: true, data };
    } catch (error) {
      console.error('Error sending password reset email:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();