import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export const hashPassword = async (password) => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const generatePassword = (length = 8) => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '@#$!';

  const all = uppercase + lowercase + numbers + symbols;
  let password = '';

  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  for (let i = 4; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  return password.split('').sort(() => Math.random() - 0.5).join('');
};

export const generateTeacherId = async (supabase) => {
  const prefix = 'T';
  let teacherId;
  let exists = true;

  while (exists) {
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    teacherId = `${prefix}${randomNum}`;

    const { data } = await supabase
      .from('teachers')
      .select('id')
      .eq('teacher_id', teacherId)
      .maybeSingle();

    exists = !!data;
  }

  return teacherId;
};

export const logActivity = async (supabase, userType, userId, action, details = {}) => {
  try {
    await supabase
      .from('activity_logs')
      .insert({
        user_type: userType,
        user_id: userId,
        action,
        details
      });
  } catch (error) {
    console.error('Activity logging error:', error);
  }
};
