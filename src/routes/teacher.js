import express from 'express';
import { supabase } from '../config/database.js';
import { requireTeacher } from '../middleware/auth.js';
import { hashPassword, generatePassword, logActivity } from '../utils/helpers.js';
import { sendCredentialsEmail } from '../config/email.js';

const router = express.Router();

router.use(requireTeacher);

router.get('/dashboard', async (req, res) => {
  try {
    const teacherId = req.session.user.id;
    const departmentId = req.session.user.departmentId;

    if (!departmentId) {
      return res.status(400).json({ error: 'Teacher is not assigned to any department' });
    }

    const { data: students, error } = await supabase
      .from('students')
      .select(`
        *,
        departments:department_id (
          id,
          name
        )
      `)
      .eq('department_id', departmentId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const { count: studentsCount } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('department_id', departmentId);

    const { data: subjects } = await supabase
      .from('subjects')
      .select('*')
      .eq('department_id', departmentId);

    res.json({
      students: students || [],
      stats: {
        totalStudents: studentsCount || 0,
        totalSubjects: subjects?.length || 0
      }
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

router.get('/students', async (req, res) => {
  try {
    const departmentId = req.session.user.departmentId;

    if (!departmentId) {
      return res.status(400).json({ error: 'Teacher is not assigned to any department' });
    }

    const { data: students, error } = await supabase
      .from('students')
      .select(`
        *,
        departments:department_id (
          id,
          name
        )
      `)
      .eq('department_id', departmentId)
      .order('student_id');

    if (error) throw error;

    res.json({ students: students || [] });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

router.post('/students', async (req, res) => {
  try {
    const { studentId, fullName, email, semester, year, batch } = req.body;
    const teacherId = req.session.user.id;
    const departmentId = req.session.user.departmentId;

    if (!departmentId) {
      return res.status(400).json({ error: 'Teacher is not assigned to any department' });
    }

    if (!studentId || !fullName || !email || !semester || !year || !batch) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const { data: existing } = await supabase
      .from('students')
      .select('id')
      .or(`student_id.eq.${studentId},email.eq.${email}`)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'Student ID or email already exists' });
    }

    const initialPassword = generatePassword(8);
    const passwordHash = await hashPassword(initialPassword);

    const { data: student, error } = await supabase
      .from('students')
      .insert({
        student_id: studentId,
        full_name: fullName,
        email,
        semester: parseInt(semester),
        year: parseInt(year),
        batch,
        department_id: departmentId,
        password_hash: passwordHash,
        must_change_password: true,
        created_by_teacher_id: teacherId
      })
      .select()
      .single();

    if (error) throw error;

    await logActivity(supabase, 'teacher', teacherId, 'student_created', {
      studentId: student.id,
      studentIdValue: studentId
    });

    try {
      await sendCredentialsEmail(email, fullName, studentId, initialPassword);
    } catch (emailError) {
      console.error('Failed to send credentials email:', emailError);
    }

    res.status(201).json({
      success: true,
      student,
      credentials: {
        studentId,
        initialPassword
      }
    });
  } catch (error) {
    console.error('Create student error:', error);
    res.status(500).json({ error: 'Failed to create student' });
  }
});

router.post('/students/generate', async (req, res) => {
  try {
    const { startId, endId, passwordMode, samePassword, semester, year, batch, namePrefix } = req.body;
    const teacherId = req.session.user.id;
    const departmentId = req.session.user.departmentId;

    if (!departmentId) {
      return res.status(400).json({ error: 'Teacher is not assigned to any department' });
    }

    if (!startId || !endId || !passwordMode || !semester || !year || !batch) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const startNum = parseInt(startId);
    const endNum = parseInt(endId);

    if (isNaN(startNum) || isNaN(endNum) || startNum > endNum) {
      return res.status(400).json({ error: 'Invalid ID range' });
    }

    if (endNum - startNum > 500) {
      return res.status(400).json({ error: 'Cannot generate more than 500 students at once' });
    }

    const students = [];
    const credentials = [];
    let basePassword = null;

    if (passwordMode === 'same') {
      if (!samePassword || samePassword.length < 8) {
        return res.status(400).json({ error: 'Same password must be at least 8 characters' });
      }
      basePassword = await hashPassword(samePassword);
    }

    const existingIds = [];
    const { data: existing } = await supabase
      .from('students')
      .select('student_id')
      .gte('student_id', startNum.toString())
      .lte('student_id', endNum.toString());

    if (existing) {
      existingIds.push(...existing.map(s => s.student_id));
    }

    for (let i = startNum; i <= endNum; i++) {
      const studentId = i.toString().padStart(6, '0');

      if (existingIds.includes(studentId)) {
        continue;
      }

      const fullName = namePrefix ? `${namePrefix} ${studentId}` : `Student ${studentId}`;
      const email = `student${studentId}@example.com`;

      let password;
      let passwordHash;

      if (passwordMode === 'same') {
        password = samePassword;
        passwordHash = basePassword;
      } else if (passwordMode === 'incremental') {
        password = `Pass${studentId}!`;
        passwordHash = await hashPassword(password);
      } else {
        password = generatePassword(8);
        passwordHash = await hashPassword(password);
      }

      students.push({
        student_id: studentId,
        full_name: fullName,
        email,
        semester: parseInt(semester),
        year: parseInt(year),
        batch,
        department_id: departmentId,
        password_hash: passwordHash,
        must_change_password: true,
        created_by_teacher_id: teacherId
      });

      credentials.push({
        studentId,
        fullName,
        email,
        password
      });
    }

    if (students.length === 0) {
      return res.status(400).json({ error: 'All student IDs in range already exist' });
    }

    const { data: created, error } = await supabase
      .from('students')
      .insert(students)
      .select();

    if (error) throw error;

    await logActivity(supabase, 'teacher', teacherId, 'students_bulk_generated', {
      count: students.length,
      startId,
      endId
    });

    res.status(201).json({
      success: true,
      count: created.length,
      credentials
    });
  } catch (error) {
    console.error('Generate students error:', error);
    res.status(500).json({ error: 'Failed to generate students' });
  }
});

router.post('/students/bulk-upload', async (req, res) => {
  try {
    const { students: studentsData } = req.body;
    const teacherId = req.session.user.id;
    const departmentId = req.session.user.departmentId;

    if (!departmentId) {
      return res.status(400).json({ error: 'Teacher is not assigned to any department' });
    }

    if (!studentsData || !Array.isArray(studentsData) || studentsData.length === 0) {
      return res.status(400).json({ error: 'Students data is required' });
    }

    const students = [];
    const credentials = [];
    const errors = [];

    for (let i = 0; i < studentsData.length; i++) {
      const row = studentsData[i];

      if (!row.studentId || !row.fullName || !row.email || !row.semester || !row.year || !row.batch) {
        errors.push({ row: i + 1, error: 'Missing required fields' });
        continue;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(row.email)) {
        errors.push({ row: i + 1, error: 'Invalid email format' });
        continue;
      }

      const { data: existing } = await supabase
        .from('students')
        .select('id')
        .or(`student_id.eq.${row.studentId},email.eq.${row.email}`)
        .maybeSingle();

      if (existing) {
        errors.push({ row: i + 1, error: 'Student ID or email already exists' });
        continue;
      }

      const initialPassword = generatePassword(8);
      const passwordHash = await hashPassword(initialPassword);

      students.push({
        student_id: row.studentId,
        full_name: row.fullName,
        email: row.email,
        semester: parseInt(row.semester),
        year: parseInt(row.year),
        batch: row.batch,
        department_id: departmentId,
        password_hash: passwordHash,
        must_change_password: true,
        created_by_teacher_id: teacherId
      });

      credentials.push({
        studentId: row.studentId,
        fullName: row.fullName,
        email: row.email,
        password: initialPassword
      });
    }

    if (students.length === 0) {
      return res.status(400).json({ error: 'No valid students to create', errors });
    }

    const { data: created, error } = await supabase
      .from('students')
      .insert(students)
      .select();

    if (error) throw error;

    await logActivity(supabase, 'teacher', teacherId, 'students_bulk_uploaded', {
      count: created.length
    });

    res.status(201).json({
      success: true,
      count: created.length,
      credentials,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ error: 'Failed to upload students' });
  }
});

router.get('/subjects', async (req, res) => {
  try {
    const departmentId = req.session.user.departmentId;

    if (!departmentId) {
      return res.status(400).json({ error: 'Teacher is not assigned to any department' });
    }

    const { data: subjects, error } = await supabase
      .from('subjects')
      .select('*')
      .eq('department_id', departmentId)
      .order('code');

    if (error) throw error;

    res.json({ subjects: subjects || [] });
  } catch (error) {
    console.error('Get subjects error:', error);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

router.post('/subjects', async (req, res) => {
  try {
    const { code, name } = req.body;
    const teacherId = req.session.user.id;
    const departmentId = req.session.user.departmentId;

    if (!departmentId) {
      return res.status(400).json({ error: 'Teacher is not assigned to any department' });
    }

    if (!code || !name) {
      return res.status(400).json({ error: 'Subject code and name are required' });
    }

    const { data: subject, error } = await supabase
      .from('subjects')
      .insert({
        code: code.toUpperCase(),
        name,
        department_id: departmentId
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Subject code already exists in this department' });
      }
      throw error;
    }

    await logActivity(supabase, 'teacher', teacherId, 'subject_created', {
      subjectId: subject.id,
      code
    });

    res.status(201).json({ success: true, subject });
  } catch (error) {
    console.error('Create subject error:', error);
    res.status(500).json({ error: 'Failed to create subject' });
  }
});

router.post('/marks', async (req, res) => {
  try {
    const { studentId, subjectId, examName, marks, maxMarks } = req.body;
    const teacherId = req.session.user.id;
    const departmentId = req.session.user.departmentId;

    if (!studentId || !subjectId || !examName || marks === undefined || !maxMarks) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const { data: student } = await supabase
      .from('students')
      .select('department_id')
      .eq('id', studentId)
      .maybeSingle();

    if (!student || student.department_id !== departmentId) {
      return res.status(403).json({ error: 'Cannot add marks for students outside your department' });
    }

    const { data: mark, error } = await supabase
      .from('marks')
      .insert({
        student_id: studentId,
        subject_id: subjectId,
        exam_name: examName,
        marks: parseFloat(marks),
        max_marks: parseFloat(maxMarks),
        created_by_teacher_id: teacherId
      })
      .select()
      .single();

    if (error) throw error;

    await logActivity(supabase, 'teacher', teacherId, 'marks_added', {
      studentId,
      subjectId,
      examName
    });

    res.status(201).json({ success: true, mark });
  } catch (error) {
    console.error('Add marks error:', error);
    res.status(500).json({ error: 'Failed to add marks' });
  }
});

router.post('/marks/upload', async (req, res) => {
  try {
    const { marks: marksData } = req.body;
    const teacherId = req.session.user.id;
    const departmentId = req.session.user.departmentId;

    if (!marksData || !Array.isArray(marksData) || marksData.length === 0) {
      return res.status(400).json({ error: 'Marks data is required' });
    }

    const marks = [];
    const errors = [];

    for (let i = 0; i < marksData.length; i++) {
      const row = marksData[i];

      if (!row.studentId || !row.subjectCode || !row.examName || row.marks === undefined || !row.maxMarks) {
        errors.push({ row: i + 1, error: 'Missing required fields' });
        continue;
      }

      const { data: student } = await supabase
        .from('students')
        .select('id, department_id')
        .eq('student_id', row.studentId)
        .maybeSingle();

      if (!student) {
        errors.push({ row: i + 1, error: 'Student not found' });
        continue;
      }

      if (student.department_id !== departmentId) {
        errors.push({ row: i + 1, error: 'Student not in your department' });
        continue;
      }

      const { data: subject } = await supabase
        .from('subjects')
        .select('id')
        .eq('code', row.subjectCode.toUpperCase())
        .eq('department_id', departmentId)
        .maybeSingle();

      if (!subject) {
        errors.push({ row: i + 1, error: 'Subject not found' });
        continue;
      }

      marks.push({
        student_id: student.id,
        subject_id: subject.id,
        exam_name: row.examName,
        marks: parseFloat(row.marks),
        max_marks: parseFloat(row.maxMarks),
        created_by_teacher_id: teacherId
      });
    }

    if (marks.length === 0) {
      return res.status(400).json({ error: 'No valid marks to add', errors });
    }

    const { data: created, error } = await supabase
      .from('marks')
      .insert(marks)
      .select();

    if (error) throw error;

    await logActivity(supabase, 'teacher', teacherId, 'marks_bulk_uploaded', {
      count: created.length
    });

    res.status(201).json({
      success: true,
      count: created.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Upload marks error:', error);
    res.status(500).json({ error: 'Failed to upload marks' });
  }
});

router.put('/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, semester, year, batch } = req.body;
    const teacherId = req.session.user.id;

    const { data: student, error: fetchError } = await supabase
      .from('students')
      .select('created_by_teacher_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (student.created_by_teacher_id !== teacherId) {
      return res.status(403).json({ error: 'You can only edit students you created' });
    }

    const updateData = {};
    if (fullName) updateData.full_name = fullName;
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      updateData.email = email;
    }
    if (semester) updateData.semester = parseInt(semester);
    if (year) updateData.year = parseInt(year);
    if (batch) updateData.batch = batch;

    const { data, error } = await supabase
      .from('students')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Email already exists' });
      }
      throw error;
    }

    await logActivity(supabase, 'teacher', teacherId, 'student_updated', { studentId: id });

    res.json({ success: true, student: data });
  } catch (error) {
    console.error('Update student error:', error);
    res.status(500).json({ error: 'Failed to update student' });
  }
});

router.delete('/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.session.user.id;

    const { data: student, error: fetchError } = await supabase
      .from('students')
      .select('created_by_teacher_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (student.created_by_teacher_id !== teacherId) {
      return res.status(403).json({ error: 'You can only delete students you created' });
    }

    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await logActivity(supabase, 'teacher', teacherId, 'student_deleted', { studentId: id });

    res.json({ success: true, message: 'Student deleted successfully' });
  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

export default router;
