const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { sequelize, User, Tutor, Learner, Session, Feedback, Notification } = require('./models');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ... existing imports ...
// ... existing app.use middleware ...

app.use(express.static(path.join(__dirname, 'public')));

/* --- ADD THIS SECTION --- */
app.get('/', (req, res) => {
  res.send('<h1>Server is Running!</h1><p>API is ready to use.</p>');
});
/* ------------------------ */

// health
app.get('/api/ping', ...
// health
app.get('/api/ping', (req, res) => res.json({pong: true}));

// Register (basic)
app.post('/api/register', async (req,res)=>{
  try{
    const { name, email, password, role } = req.body;
    if(!name||!email||!password||!role) return res.status(400).json({error:'Missing fields'});
    const user = await User.create({ name, email, password, role });
    // create tutor or learner record if needed
    if(role === 'Tutor') await Tutor.create({ userId: user.id, subjects: '', availability: '' });
    if(role === 'Learner') await Learner.create({ userId: user.id });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }});
  }catch(e){ console.error(e); res.status(500).json({error:'Server error', details: e.message}); }
});

// Login (very simple)
app.post('/api/login', async (req,res)=>{
  try{
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email }});
    if(!user || user.password !== password) return res.status(401).json({error:'Invalid credentials'});
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }});
  }catch(e){ console.error(e); res.status(500).json({error:'Server error'}); }
});

// List tutors (optional filter by subject)
app.get('/api/tutors', async (req,res)=>{
  try{
    const { subject } = req.query;
    let tutors;
    if(subject){
      // naive filter: find tutors whose subjects string contains the subject term
      tutors = await Tutor.findAll({ where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('subjects')),
        'LIKE', `%${subject.toLowerCase()}%`
      )});
    } else {
      tutors = await Tutor.findAll();
    }
    // attach basic user info
    const withUsers = await Promise.all(tutors.map(async t=>{
      const u = await User.findByPk(t.userId);
      return { id: t.id, userId: t.userId, name: u ? u.name : '', subjects: t.subjects, availability: t.availability, rating: t.rating };
    }));
    res.json(withUsers);
  }catch(e){ console.error(e); res.status(500).json({error:'Server error'}); }
});

// Helper: get learner record by user id
app.get('/api/learnerByUser/:userId', async (req,res)=>{
  try{
    const userId = req.params.userId;
    const learner = await Learner.findOne({ where: { userId }});
    if(!learner) return res.status(404).json({ error:'No learner record' });
    res.json({ learner });
  }catch(e){ console.error(e); res.status(500).json({ error:'Server error' }); }
});

// Helper: get tutor record by user id
app.get('/api/tutorByUser/:userId', async (req,res)=>{
  try{
    const userId = req.params.userId;
    const tutor = await Tutor.findOne({ where: { userId }});
    if(!tutor) return res.status(404).json({ error:'No tutor record' });
    res.json({ tutor });
  }catch(e){ console.error(e); res.status(500).json({ error:'Server error' }); }
});

// Book session
app.post('/api/book', async (req,res)=>{
  try{
    const { learnerUserId, tutorId, date, time, subject } = req.body;
    if(!learnerUserId||!tutorId||!date||!time||!subject) return res.status(400).json({error:'Missing fields'});
    const learner = await Learner.findOne({ where: { userId: learnerUserId }});
    if(!learner) return res.status(400).json({ error:'Learner profile not found' });
    const session = await Session.create({ learnerId: learner.id, tutorId, date, time, subject, status: 'Pending' });
    // create notification for tutor (use tutor.userId)
    const tutor = await Tutor.findByPk(tutorId);
    if(tutor) await Notification.create({ userId: tutor.userId, message: `New session request (session ${session.id})`});
    res.json({ session });
  }catch(e){ console.error(e); res.status(500).json({error:'Server error', details: e.message}); }
});

// Tutor accepts session
app.post('/api/session/:id/accept', async (req,res)=>{
  try{
    const id = req.params.id;
    const session = await Session.findByPk(id);
    if(!session) return res.status(404).json({error:'Not found'});
    session.status = 'Accepted';
    await session.save();
    // create notification for learner
    const learner = await Learner.findByPk(session.learnerId);
    if(learner) await Notification.create({ userId: learner.userId, message: `Your session ${id} was accepted`});
    res.json({ session });
  }catch(e){ console.error(e); res.status(500).json({error:'Server error'}); }
});

// Tutor rejects session
app.post('/api/session/:id/reject', async (req,res)=>{
  try{
    const id = req.params.id;
    const session = await Session.findByPk(id);
    if(!session) return res.status(404).json({error:'Not found'});
    session.status = 'Rejected';
    await session.save();
    const learner = await Learner.findByPk(session.learnerId);
    if(learner) await Notification.create({ userId: learner.userId, message: `Your session ${id} was rejected`});
    res.json({ session });
  }catch(e){ console.error(e); res.status(500).json({error:'Server error'}); }
});

// Tutor reschedules session (new date/time)
app.post('/api/session/:id/reschedule', async (req,res)=>{
  try{
    const id = req.params.id;
    const { date, time } = req.body;
    const session = await Session.findByPk(id);
    if(!session) return res.status(404).json({error:'Not found'});
    if(date) session.date = date;
    if(time) session.time = time;
    session.status = 'Pending';
    await session.save();
    const learner = await Learner.findByPk(session.learnerId);
    if(learner) await Notification.create({ userId: learner.userId, message: `Your session ${id} was rescheduled to ${session.date} ${session.time}`});
    res.json({ session });
  }catch(e){ console.error(e); res.status(500).json({error:'Server error'}); }
});

/* ---------------------------
   NEW: mark completed endpoint
   --------------------------- */
// Tutor marks session completed
app.post('/api/session/:id/complete', async (req, res) => {
  try {
    const id = req.params.id;
    const session = await Session.findByPk(id);
    if(!session) return res.status(404).json({ error: 'Session not found' });
    session.status = 'Completed';
    await session.save();
    // notify learner
    const learner = await Learner.findByPk(session.learnerId);
    if(learner) await Notification.create({ userId: learner.userId, message: `Session ${id} marked as completed`});
    res.json({ session });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---------------------------
   Feedback endpoints
   --------------------------- */

// Student posts feedback for a session
// body: { sessionId, rating (1-5), comment, learnerUserId }
app.post('/api/feedback', async (req, res) => {
  try {
    const { sessionId, rating, comment, learnerUserId } = req.body;
    if(!sessionId || !rating || !learnerUserId) return res.status(400).json({ error: 'Missing fields' });

    const session = await Session.findByPk(sessionId);
    if(!session) return res.status(404).json({ error: 'Session not found' });

    // verify the learnerUserId corresponds to the session's learner
    const learner = await Learner.findByPk(session.learnerId);
    if(!learner || learner.userId !== learnerUserId) return res.status(403).json({ error: 'Not authorized to feedback this session' });

    // Ensure session status is Completed
    if(session.status !== 'Completed') return res.status(400).json({ error: 'Session must be Completed before submitting feedback' });

    // prevent duplicate feedback: allow only one feedback per session
    const existing = await Feedback.findOne({ where: { sessionId }});
    if(existing) return res.status(400).json({ error: 'Feedback already submitted for this session' });

    const fb = await Feedback.create({ sessionId, rating, comment });

    // Recalculate tutor rating (average of all feedbacks for that tutor)
    const tutor = await Tutor.findByPk(session.tutorId);
    if(tutor){
      // get all feedbacks for sessions belonging to this tutor
      const tutorSessions = await Session.findAll({ where: { tutorId: tutor.id }});
      const sessionIds = tutorSessions.map(s => s.id);
      const fbs = await Feedback.findAll({ where: { sessionId: sessionIds }});
      if(fbs.length > 0){
        const avg = fbs.reduce((acc, x) => acc + (x.rating || 0), 0) / fbs.length;
        tutor.rating = parseFloat(avg.toFixed(2));
      } else {
        tutor.rating = 0;
      }
      await tutor.save();
    }

    // notify tutor and admin
    const t = await Tutor.findByPk(session.tutorId);
    if(t) await Notification.create({ userId: t.userId, message: `New feedback for session ${sessionId}`});

    res.json({ feedback: fb });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error', details: e.message });
  }
});

// Get feedback for a tutor (recent)
app.get('/api/feedback/tutor/:tutorId', async (req, res) => {
  try {
    const tutorId = req.params.tutorId;
    const sessions = await Session.findAll({ where: { tutorId }});
    const sessionIds = sessions.map(s => s.id);
    if(sessionIds.length === 0) return res.json([]);
    const feedbacks = await Feedback.findAll({
      where: { sessionId: sessionIds },
      order: [['createdAt', 'DESC']],
      limit: 5
    });
    // attach learner name + session info
    const enriched = await Promise.all(feedbacks.map(async f => {
      const session = await Session.findByPk(f.sessionId);
      const learner = session ? await Learner.findByPk(session.learnerId) : null;
      const learnerUser = learner ? await User.findByPk(learner.userId) : null;
      return { feedback: f, session, learnerName: learnerUser ? learnerUser.name : 'Learner' };
    }));
    res.json(enriched);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ---------------------------
   Existing sessions endpoints (unchanged)
   --------------------------- */

// Get sessions for a learner by userId (returns sessions joined with tutor user name)
app.get('/api/sessions/learner/:userId', async (req,res)=>{
  try{
    const userId = req.params.userId;
    const learner = await Learner.findOne({ where: { userId }});
    if(!learner) return res.json([]);
    const sessions = await Session.findAll({ where: { learnerId: learner.id } });
    // attach tutor name and feedback flag
    const enriched = await Promise.all(sessions.map(async s=>{
      const t = await Tutor.findByPk(s.tutorId);
      const tutorUser = t ? await User.findByPk(t.userId) : null;
      const feedback = await Feedback.findOne({ where: { sessionId: s.id }});
      return { session: s, tutorName: tutorUser ? tutorUser.name : 'Tutor', feedback };
    }));
    res.json(enriched);
  }catch(e){ console.error(e); res.status(500).json({ error:'Server error' }); }
});

// Get sessions for a tutor by userId
app.get('/api/sessions/tutor/:userId', async (req,res)=>{
  try{
    const userId = req.params.userId;
    const tutor = await Tutor.findOne({ where: { userId }});
    if(!tutor) return res.json([]);
    const sessions = await Session.findAll({ where: { tutorId: tutor.id } });
    // attach learner name
    const enriched = await Promise.all(sessions.map(async s=>{
      const learner = await Learner.findByPk(s.learnerId);
      const learnerUser = learner ? await User.findByPk(learner.userId) : null;
      // attach feedback if present
      const feedback = await Feedback.findOne({ where: { sessionId: s.id }});
      return { session: s, learnerName: learnerUser ? learnerUser.name : 'Learner', feedback };
    }));
    res.json(enriched);
  }catch(e){ console.error(e); res.status(500).json({ error:'Server error' }); }
});

// Update tutor profile (subjects, availability) by userId
app.post('/api/tutor/update-profile', async (req,res)=>{
  try{
    const { userId, subjects, availability } = req.body;
    const tutor = await Tutor.findOne({ where: { userId }});
    if(!tutor) return res.status(404).json({ error:'Tutor not found' });
    if(typeof subjects !== 'undefined') tutor.subjects = subjects;
    if(typeof availability !== 'undefined') tutor.availability = availability;
    await tutor.save();
    res.json({ tutor });
  }catch(e){ console.error(e); res.status(500).json({ error:'Server error' }); }
});

// List notifications for user
app.get('/api/notifications/:userId', async (req,res)=>{
  try{
    const userId = req.params.userId;
    const notes = await Notification.findAll({ where: { userId }});
    res.json(notes);
  }catch(e){ console.error(e); res.status(500).json({ error:'Server error' }); }
});

/* --------------------------
   ADMIN: Level 1 endpoints
   -------------------------- */

// Get all users (with role)
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.findAll({ attributes: ['id','name','email','role','createdAt'] });
    res.json(users);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a user by id (also delete associated Tutor/Learner/notifications/sessions)
app.delete('/api/admin/user/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const user = await User.findByPk(id);
    if(!user) return res.status(404).json({ error: 'User not found' });

    // If user is a Tutor: delete tutor record and sessions where tutorId
    const tutor = await Tutor.findOne({ where: { userId: user.id }});
    if(tutor){
      // delete sessions for this tutor
      const tutorSessions = await Session.findAll({ where: { tutorId: tutor.id }});
      for(const s of tutorSessions){
        // delete feedback for session (if any)
        await Feedback.destroy({ where: { sessionId: s.id }});
        await s.destroy();
      }
      await tutor.destroy();
    }

    // If user is a Learner: delete learner record and sessions where learnerId
    const learner = await Learner.findOne({ where: { userId: user.id }});
    if(learner){
      const learnerSessions = await Session.findAll({ where: { learnerId: learner.id }});
      for(const s of learnerSessions){
        await Feedback.destroy({ where: { sessionId: s.id }});
        await s.destroy();
      }
      await learner.destroy();
    }

    // delete notifications
    await Notification.destroy({ where: { userId: user.id }});

    // finally delete user
    await user.destroy();

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all sessions (enriched with tutor & learner names)
app.get('/api/admin/sessions', async (req, res) => {
  try {
    const sessions = await Session.findAll();
    const enriched = await Promise.all(sessions.map(async s => {
      const tutor = await Tutor.findByPk(s.tutorId);
      const tutorUser = tutor ? await User.findByPk(tutor.userId) : null;
      const learner = await Learner.findByPk(s.learnerId);
      const learnerUser = learner ? await User.findByPk(learner.userId) : null;
      const feedback = await Feedback.findOne({ where: { sessionId: s.id }});
      return {
        session: s,
        tutorName: tutorUser ? tutorUser.name : 'Tutor',
        learnerName: learnerUser ? learnerUser.name : 'Learner',
        feedback
      };
    }));
    res.json(enriched);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* NEW: Admin feedback listing */
app.get('/api/admin/feedbacks', async (req, res) => {
  try {
    const feedbacks = await Feedback.findAll({ order: [['createdAt','DESC']] });
    const enriched = await Promise.all(feedbacks.map(async f => {
      const session = await Session.findByPk(f.sessionId);
      const tutor = session ? await Tutor.findByPk(session.tutorId) : null;
      const tutorUser = tutor ? await User.findByPk(tutor.userId) : null;
      const learner = session ? await Learner.findByPk(session.learnerId) : null;
      const learnerUser = learner ? await User.findByPk(learner.userId) : null;
      return {
        feedback: f,
        session,
        tutorName: tutorUser ? tutorUser.name : 'Tutor',
        learnerName: learnerUser ? learnerUser.name : 'Learner'
      };
    }));
    res.json(enriched);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* --------------------------
   End ADMIN endpoints
   -------------------------- */

// init and start
// CHANGED: Use environment port and bind to 0.0.0.0 for Railway
const PORT = process.env.PORT || 8080;
(async () => {
  try {
    await sequelize.sync();
    app.listen(PORT, '0.0.0.0', () => console.log(`Server started on ${PORT}`));
  } catch (error) {
    console.error("Unable to start server or sync DB:", error);
  }
})();
