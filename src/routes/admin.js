import express from 'express';
import { supabase } from '../config/database.js';
import { requireAdmin } from '../middleware/auth.js';
import { hashPassword, generatePassword, generateTeacherId, logActivity } from '../utils/helpers.js';
import { sendCredentialsEmail } from '../config/email.js';

const router = express.Router();

router.use(requireAdmin);

router.get('/departments', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .order('name');

    if (error) throw error;

    res.json({ departments: data });
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

router.post('/departments', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Department name is required' });
    }

    const { data, error } = await supabase
      .from('departments')
      .insert({ name: name.trim() })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Department already exists' });
      }
      throw error;
    }

    await logActivity(supabase, 'admin', req.session.user.id, 'department_created', { departmentId: data.id, name });

    res.status(201).json({ success: true, department: data });
  } catch (error) {
    console.error('Create department error:', error);
    res.status(500).json({ error: 'Failed to create department' });
  }
});

router.get('/teachers', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('teachers')
      .select(`
        *,
        departments:department_id (
          id,
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const teachers = data.map(teacher => ({
      id: teacher.id,
      teacherId: teacher.teacher_id,
      username: teacher.username,
      fullName: teacher.full_name,
      email: teacher.email,
      phone: teacher.phone,
      department: teacher.departments,
      createdAt: teacher.created_at
    }));

    res.json({ teachers });
  } catch (error) {
    console.error('Get teachers error:', error);
    res.status(500).json({ error: 'Failed to fetch teachers' });
  }
});

router.post('/teachers', async (req, res) => {
  try {
    const { fullName, email, phone, departmentId } = req.body;

    if (!fullName || !email || !departmentId) {
      return res.status(400).json({ error: 'Full name, email, and department are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const { data: existingTeacher } = await supabase
      .from('teachers')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingTeacher) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const teacherId = await generateTeacherId(supabase);
    const initialPassword = generatePassword(10);
    const passwordHash = await hashPassword(initialPassword);

    const { data: teacher, error } = await supabase
      .from('teachers')
      .insert({
        teacher_id: teacherId,
        username: teacherId,
        password_hash: passwordHash,
        full_name: fullName,
        email,
        phone: phone || null,
        department_id: departmentId,
        must_change_password: true
      })
      .select(`
        *,
        departments:department_id (
          id,
          name
        )
      `)
      .single();

    if (error) throw error;

    await logActivity(supabase, 'admin', req.session.user.id, 'teacher_created', {
      teacherId: teacher.id,
      teacherIdValue: teacherId
    });

    try {
      await sendCredentialsEmail(email, fullName, teacherId, initialPassword);
    } catch (emailError) {
      console.error('Failed to send credentials email:', emailError);
    }

    res.status(201).json({
      success: true,
      teacher: {
        id: teacher.id,
        teacherId: teacher.teacher_id,
        fullName: teacher.full_name,
        email: teacher.email,
        phone: teacher.phone,
        department: teacher.departments
      },
      credentials: {
        teacherId,
        initialPassword
      }
    });
  } catch (error) {
    console.error('Create teacher error:', error);
    res.status(500).json({ error: 'Failed to create teacher' });
  }
});

router.put('/teachers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, phone, departmentId } = req.body;

    const updateData = {};
    if (fullName) updateData.full_name = fullName;
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      updateData.email = email;
    }
    if (phone !== undefined) updateData.phone = phone;
    if (departmentId) updateData.department_id = departmentId;

    const { data, error } = await supabase
      .from('teachers')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        departments:department_id (
          id,
          name
        )
      `)
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Email already exists' });
      }
      throw error;
    }

    await logActivity(supabase, 'admin', req.session.user.id, 'teacher_updated', { teacherId: id });

    res.json({
      success: true,
      teacher: {
        id: data.id,
        teacherId: data.teacher_id,
        fullName: data.full_name,
        email: data.email,
        phone: data.phone,
        department: data.departments
      }
    });
  } catch (error) {
    console.error('Update teacher error:', error);
    res.status(500).json({ error: 'Failed to update teacher' });
  }
});

router.delete('/teachers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('teachers')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await logActivity(supabase, 'admin', req.session.user.id, 'teacher_deleted', { teacherId: id });

    res.json({ success: true, message: 'Teacher deleted successfully' });
  } catch (error) {
    console.error('Delete teacher error:', error);
    res.status(500).json({ error: 'Failed to delete teacher' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const [
      { count: teachersCount },
      { count: studentsCount },
      { count: departmentsCount }
    ] = await Promise.all([
      supabase.from('teachers').select('*', { count: 'exact', head: true }),
      supabase.from('students').select('*', { count: 'exact', head: true }),
      supabase.from('departments').select('*', { count: 'exact', head: true })
    ]);

    res.json({
      stats: {
        teachers: teachersCount || 0,
        students: studentsCount || 0,
        departments: departmentsCount || 0
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;
