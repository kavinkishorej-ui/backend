import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export const sendOTPEmail = async (email, otp, userName) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || 'noreply@studentportal.com',
    to: email,
    subject: 'Password Reset OTP - Student Marks Portal',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Hello ${userName},</p>
        <p>You have requested to reset your password. Use the following OTP code to complete the process:</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
          ${otp}
        </div>
        <p><strong>This OTP will expire in 10 minutes.</strong></p>
        <p>If you did not request this password reset, please ignore this email.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #666; font-size: 12px;">Student Marks Display Portal</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    throw new Error('Failed to send OTP email');
  }
};

export const sendCredentialsEmail = async (email, userName, userId, password) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || 'noreply@studentportal.com',
    to: email,
    subject: 'Your Account Credentials - Student Marks Portal',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Student Marks Portal</h2>
        <p>Hello ${userName},</p>
        <p>Your account has been created. Here are your login credentials:</p>
        <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0;">
          <p><strong>User ID:</strong> ${userId}</p>
          <p><strong>Username:</strong> ${userId}</p>
          <p><strong>Initial Password:</strong> ${password}</p>
        </div>
        <p><strong>Important:</strong> You will be required to change your password upon first login.</p>
        <p>Please keep these credentials secure and do not share them with anyone.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #666; font-size: 12px;">Student Marks Display Portal</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    return false;
  }
};
