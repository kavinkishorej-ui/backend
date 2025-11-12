import express from 'express';
import { supabase } from '../config/database.js';
import { comparePassword, hashPassword, generateOTP, logActivity } from '../utils/helpers.js';
import { sendOTPEmail } from '../config/email.js';
import { otpRequestLimiter, loginLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { role, username, password } = req.body;

    if (!role || !username || !password) {
      return res.status(400).json({ error: 'Role, username, and password are required' });
    }

    let user = null;
    let tableName = '';
    let idField = 'username';

    if (role === 'admin') {
      tableName = 'admins';
      const { data } = await supabase
        .from('admins')
        .select('*')
        .eq('username', username)
        .maybeSingle();
      user = data;
    } else if (role === 'teacher') {
      tableName = 'teachers';
      idField = 'teacher_id';
      const { data } = await supabase
        .from('teachers')
        .select('*')
        .eq('teacher_id', username)
        .maybeSingle();
      user = data;
    } else if (role === 'student') {
      tableName = 'students';
      idField = 'student_id';
      const { data } = await supabase
        .from('students')
        .select('*')
        .eq('student_id', username)
        .maybeSingle();
      user = data;
    } else {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const sessionUser = {
      id: user.id,
      role,
      username: user[idField],
      fullName: user.full_name,
      email: user.email,
      departmentId: user.department_id || null,
      mustChangePassword: user.must_change_password || false
    };

    req.session.user = sessionUser;

    await logActivity(supabase, role, user.id, 'login', { username: user[idField] });

    res.json({
      success: true,
      user: sessionUser
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

router.post('/change-password', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { currentPassword, newPassword } = req.body;
    const { role, id } = req.session.user;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    let tableName = role === 'admin' ? 'admins' : role === 'teacher' ? 'teachers' : 'students';

    const { data: user } = await supabase
      .from(tableName)
      .select('password_hash')
      .eq('id', id)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValidPassword = await comparePassword(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newPasswordHash = await hashPassword(newPassword);

    await supabase
      .from(tableName)
      .update({
        password_hash: newPasswordHash,
        must_change_password: false
      })
      .eq('id', id);

    if (req.session.user) {
      req.session.user.mustChangePassword = false;
    }

    await logActivity(supabase, role, id, 'password_changed');

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

router.post('/forgot-password', otpRequestLimiter, async (req, res) => {
  try {
    const { role, identifier } = req.body;

    if (!role || !identifier) {
      return res.status(400).json({ error: 'Role and identifier are required' });
    }

    if (role === 'admin') {
      return res.status(400).json({ error: 'Password reset not available for admin accounts' });
    }

    let user = null;
    let idField = '';

    if (role === 'teacher') {
      idField = 'teacher_id';
      const { data } = await supabase
        .from('teachers')
        .select('id, email, full_name, teacher_id')
        .eq('teacher_id', identifier)
        .maybeSingle();
      user = data;
    } else if (role === 'student') {
      idField = 'student_id';
      const { data } = await supabase
        .from('students')
        .select('id, email, full_name, student_id')
        .eq('student_id', identifier)
        .maybeSingle();
      user = data;
    } else {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If the account exists, an OTP has been sent to the registered email'
      });
    }

    await supabase
      .from('otp_tokens')
      .update({ used: true })
      .eq('user_id', user.id)
      .eq('user_type', role)
      .eq('used', false);

    const otp = generateOTP();
    const otpHash = await hashPassword(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabase
      .from('otp_tokens')
      .insert({
        user_type: role,
        user_id: user.id,
        otp_code_hash: otpHash,
        expires_at: expiresAt,
        used: false
      });

    try {
      await sendOTPEmail(user.email, otp, user.full_name);

      await logActivity(supabase, role, user.id, 'otp_requested', { identifier });

      res.json({
        success: true,
        message: 'OTP has been sent to your registered email address'
      });
    } catch (emailError) {
      console.error('Failed to send OTP email:', emailError);

      await supabase
        .from('otp_tokens')
        .update({ used: true })
        .eq('user_id', user.id)
        .eq('user_type', role)
        .eq('used', false);

      return res.status(503).json({
        error: 'Failed to send OTP email. Please contact your administrator.'
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

router.post('/verify-otp', otpRequestLimiter, async (req, res) => {
  try {
    const { role, identifier, otp, newPassword } = req.body;

    if (!role || !identifier || !otp || !newPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    if (role === 'admin') {
      return res.status(400).json({ error: 'Password reset not available for admin accounts' });
    }

    let user = null;
    let tableName = '';

    if (role === 'teacher') {
      tableName = 'teachers';
      const { data } = await supabase
        .from('teachers')
        .select('id')
        .eq('teacher_id', identifier)
        .maybeSingle();
      user = data;
    } else if (role === 'student') {
      tableName = 'students';
      const { data } = await supabase
        .from('students')
        .select('id')
        .eq('student_id', identifier)
        .maybeSingle();
      user = data;
    } else {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const { data: otpTokens } = await supabase
      .from('otp_tokens')
      .select('*')
      .eq('user_type', role)
      .eq('user_id', user.id)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (!otpTokens || otpTokens.length === 0) {
      return res.status(400).json({ error: 'OTP expired or invalid' });
    }

    let validToken = null;
    for (const token of otpTokens) {
      const isValid = await comparePassword(otp, token.otp_code_hash);
      if (isValid) {
        validToken = token;
        break;
      }
    }

    if (!validToken) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    await supabase
      .from('otp_tokens')
      .update({ used: true })
      .eq('id', validToken.id);

    const newPasswordHash = await hashPassword(newPassword);

    await supabase
      .from(tableName)
      .update({
        password_hash: newPasswordHash,
        must_change_password: false
      })
      .eq('id', user.id);

    await logActivity(supabase, role, user.id, 'password_reset_via_otp', { identifier });

    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

router.get('/session', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: 'No active session' });
  }
});

export default router;
