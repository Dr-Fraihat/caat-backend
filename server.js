require('dotenv').config(); // ⬅️ NEW LINE
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // 🔥 add this here
const express = require('express');
const cors = require("cors");

const bodyParser = require('body-parser');
const OpenAI = require('openai');

// ✅ Correct: Configure OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ Setup Express server
const app = express();
const allowedOrigins = [
  // local dev
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://localhost:3000",
  "http://localhost:5173",
  // production frontends (adjust to your real domains)
  "https://caat.americanautismcouncil.org",
  "https://YOUR-VERCEL-SITE.vercel.app",
  "https://YOUR-CUSTOM-DOMAIN.com"
];


// Parse JSON before routes (keep only one parser in the file)
app.use(express.json({ limit: '1mb' }));  // or bodyParser.json()

// CORS: allow localhost (any port) and your prod domains.
// This responds on ALL routes and ALL methods (incl. OPTIONS and errors),
// so preflight always gets the headers it needs.
// CORS (mirror origin and requested headers for every route/method)
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');

  // allow GET/POST/OPTIONS by default
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  // reflect requested headers so preflight always passes
  const reqHdrs = req.headers['access-control-request-headers'];
  res.setHeader('Access-Control-Allow-Headers', reqHdrs || 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204); // preflight OK
  }
  next();
});








// ✅ POST endpoint to handle report generation
app.post('/generate-report', async (req, res) => {
  // --- Template & language selection + payload normalization ---
const tQuery  = (req.query?.template || '').toLowerCase();
const tHeader = (req.headers['x-report-type'] || '').toLowerCase();
const tBody   = (req.body?.meta?.reportType || '').toLowerCase();
const pick    = tQuery || tHeader || tBody || 'adir';
const isOT    = (pick === 'ot');

// language (keep your behaviour, but tolerate single string or array)
const selectedLangs = req.body.languages || req.body.langs || ['en'];
const lang = Array.isArray(selectedLangs) ? selectedLangs[0] : selectedLangs;
const targetLang = lang === 'ar' ? 'Arabic' : lang === 'fr' ? 'French' : 'English';

// normalize payloads: your ADIR flow sends { data, languages }, OT sends full payload
const intakeData = req.body?.data || null;  // ADIR
const otData     = isOT ? (req.body || null) : null;

console.log('🧩 template =', pick, '| targetLang =', targetLang);


   const promptADIR = `
You are a clinical autism assessment specialist. Write a **professional, highly detailed narrative report** based on the intake JSON provided.
The report must be written in **${targetLang}**.

Each section should be written in polished, natural language, clearly structured, and grouped under appropriate clinical headings...

Use real double line breaks (\\n\\n) between paragraphs instead of single newlines. This is required for correct paragraph rendering in HTML.

All section headers (such as "Demographic Summary", "Background and Birth History", etc.) must use:

<h2 style="color:#1a3e80; font-size:20px;">Section Title</h2>

Do not use Markdown (**), <h1>, or <h3>. Use only <h2> with the inline style above.

Format all section headings (such as Demographic Summary, Background and Birth History, Medical and Developmental History, Developmental and Behavioral History, Sensory Profile, Educational History, Clinical Observations, and Recommendations) using Markdown syntax as plain text headers without emojis, asterisks, or symbols.

Use this format for all major section titles:
Demographic Summary
Background and Birth History
Medical and Developmental History
etc.

Do not use any icons, emojis, or symbols. The section titles should appear clean, professional, bold, and easily scannable for a PDF export.

Every time the child's name appears in the report, wrap it in <strong> tags to make it bold (e.g., <strong>JOHA</strong>). Do not use asterisks (**) or markdown; use HTML formatting only.

Ensure that all content in the generated narrative report respects page layout constraints. Leave sufficient vertical spacing at the top and bottom of each page to prevent overlap with headers and footers. The report should include appropriate paragraph spacing and avoid crowding near the page edges. Content should not be rendered closer than 2cm (or 1 inch) to the top or bottom margin of any page.

Do **NOT include identifying fields** such as:
- Full name
- Date of birth
- Intake date
- Gender
- Case manager name

These are placed elsewhere in the report. Focus only on the narrative.
Do not use the word "client" — always refer to the child by their first name only, using <strong> tags (e.g., <strong>JOHA</strong>).
---

🧠 USE THIS STRUCTURE:

Demographic Summary
- Describe age.
- Describe household structure (guardians, custody %, who lives with whom, siblings).
- Mention marital status of parents.
- Mention language exposure (primary/secondary and % exposure).
- Mention extended family involvement.
- Describe the main reason(s) for assessment + goals using 'primaryConcerns' and 'desiredOutcomes'.

📌 Example:
Demographic Summary
The client is a 13-year-old boy who primarily resides with his mother, Maha, approximately 70% of the time, alongside two siblings: Suliman (19) and Sara (18). The remaining 30% of his time is spent with his father, Ahmad, in a secondary household that includes two other siblings, Noa (16) and Maram (12). Additionally, two older siblings, Samantha (21) and Killy (22), do not reside in either household. The parents are divorced, and the maternal grandparents are actively involved in the child’s life.

Arabic is the child’s primary language, with English serving as a secondary language. He has approximately 30% exposure to English. The primary concern expressed by the caregivers centers around delayed speech development. The family seeks a formal diagnosis to better understand the child’s needs and to explore appropriate therapeutic support options.
do not use any where in the report The client is always use the client first name

Background and Birth History
- Mother's and father's age at birth.
- Consanguinity level.
- Pregnancy planning, fertility treatment.
- Medications used during pregnancy.
- Drug/tobacco use if present.
- Pregnancy complications + details.
- Type of birth, weeks (if premature), labor complications.
- NICU admission: duration and reason.
- Neonatal concerns (e.g., jaundice, seizures).

📌 Example:
Background and Medical History
At the time of the child’s birth, the mother was 40 years old and the father was 50. The parents are first cousins, and the pregnancy was both planned and achieved with the support of fertility treatments. The child was part of a twin pregnancy and identified as an identical twin.
During the pregnancy, the mother took vitamins, supplements, and antidepressants, and she reported tobacco use. Pregnancy was complicated by spotting, a threatened miscarriage, and high blood pressure. Labor was induced using Pitocin, and the child was born prematurely at 29 weeks via vaginal delivery.
The delivery was complicated by a low fetal heart rate. Following birth, the child required NICU admission for jaundice and remained hospitalized for nine days. Additional neonatal complications included feeding difficulties, irregular sleep, and seizures.
The child has documented medical conditions including seizures, asthma, failure to thrive, and dental issues. He has a peanut allergy and follows a gluten-free and casein-free diet. Past medical evaluations include normal audiological, vision, and EEG results, while psychological testing revealed abnormal findings. Diagnosed developmental conditions include ADHD, Autism Spectrum Disorder (ASD), and Developmental Delay (DD). He has been taking risperidone (0.25 mg twice daily) for four years.

---

Medical and Developmental History
- List any medical diagnoses (e.g., seizures, asthma, failure to thrive).
- Note if therapy was provided and what type.
- If previous evaluations were performed, summarize results (e.g., "audiological normal", "psych abnormal").
- List allergies and dietary restrictions.
- Note any biomedical interventions, medication, and duration.

📌 Example:
Developmental History
Developmentally, the child met several early milestones including smiling, making eye contact, laughing, recognizing family members, and showing early problem-solving abilities. He demonstrated basic cognitive abilities such as following one-step directions and imitation. In terms of language development, he displayed babbling and early word use; however, only about 10 functional words are currently used.
Caregivers report a significant regression at age 3, when the child lost previously acquired words. His preferred method of requesting basic needs, such as food or sleep, is pulling his mother’s hand toward the desired item or activity. While he has mastered early physical milestones including rolling, sitting, crawling, walking, and jumping, many self-help skills in grooming and dressing remain undeveloped or unreported.
Feeding skills are present but inconsistent. He is capable of drinking from a cup and using his fingers to feed but is described as a messy and picky eater.

---

Developmental and Behavioral History
- Use milestones: highlight achievements or delays.
- Mention regression (loss of skills) and age noticed.
- Describe cognitive, language, physical development milestones.
- Include daily living skills like feeding, dressing, grooming if available.

📌 Example:
The child presents with a complex behavioral profile that includes aggression, self-injury, difficulty with transitions, inappropriate behaviors, ritualistic tendencies, repetitive behaviors, and fixations. These behaviors often intensify in response to stress, changes in routine, or sensory overload.
Socially, he struggles to make friends and lacks age-appropriate social interaction skills. No detailed caregiver observations were provided about these challenges, though his reluctance to engage with peers is evident. The child has also recently experienced a significant environmental stressor related to moving houses.

---

Sensory Profile
- Mention affect traits like active, impulsive, stubborn.
- Describe which sensory domains show hypersensitivity (tactile, hearing, taste, smell, etc.).
- List common reactions (crying, running away, hands over ears).

📌 Example:
The child demonstrates several sensory sensitivities and regulatory challenges. Behaviorally, he is described as active, impulsive, resistant to change, clumsy, and stubborn. He shows heightened sensitivity in tactile, hearing, taste, and smell domains. His body awareness is noted to be high, while vestibular and interoceptive concerns were not identified.
Observable reactions to sensory input include crying, running away, and placing hands over ears. These responses suggest underlying sensory processing difficulties that may contribute to behavioral dysregulation and discomfort in unfamiliar environments.

---

Educational History
- School enrollment status, grade level.
- Attendance frequency.
- Special services received or not.
- Challenges in reading/writing.
- Social functioning in school.
- Typical weekday/weekend routines.
- Interests and hobbies.

📌 Example:
The child is currently not enrolled in school. No formal educational program or accommodations were reported. He has not repeated any grades and is described as having no documented learning challenges. His hand preference is right.

His weekday routine typically includes staying at home, watching television, or playing with a phone. On weekends, he occasionally visits the park with his father but otherwise remains at home. He has a strong interest in numbers but lacks reported strengths in other academic or social areas.

---

Clinical Observations
- Describe grooming, facial affect, transitions.
- Parent interaction: attachment, separation anxiety, compliance.
- Clinician interaction: initiation, eye contact, shared attention.
- Language: verbal output, echolalia, gestures/AAC.
- Play: imaginative, constructive, repetitive.
- Movement: stimming, tiptoeing, fine motor.
- Behavior: mood, regulation, rigidity, attention, fixation.
- Social: peer interaction, friendships.

📌 Example:
During the clinical intake, the child appeared well-groomed and presented with a neutral facial expression. He displayed a hyperactive activity level and difficulty with transitions. Secure attachment to the parent was noted, although separation anxiety was also observed. He demonstrated oppositional behaviors and required prompting to comply with parent and clinician instructions.
Communication was significantly delayed. He had limited verbal output and exhibited echolalia. Nonverbal communication methods, such as gestures or AAC, were not reliably used. He showed limited eye contact and rarely initiated social interactions.
Sensory behaviors such as hand-flapping, toe-walking, and fixations on visual stimuli were documented. Fine motor skills appeared delayed. Overall mood was variable and frustration tolerance was low. Although constructive play was age-appropriate, imaginative and social play were limited and often repetitive. Attention to tasks was minimal, and transitions between activities were challenging

---
`;




const promptOT = `
You are a senior pediatric **Occupational Therapist**. Write a **professional OT evaluation report** in **${targetLang}**, based on the JSON provided.
Structure the report with these sections (omit sections that have no data):
1) Client / Context (use client meta if present).
2) Occupational Profile & Daily Routines (routines + top challenges).
3) Sensory Processing: summarize otCore.Sensory index and each subdomain with severity (Typical / Mild / Moderate / Severe) and key behaviors.
4) Motor — Fine & Visual Motor: use otCore["Motor_Fine"] + handwriting details (letter formation, spacing, speed, copying, keyboarding, accommodations).
5) Motor — Gross & Praxis: use otCore["Motor_Gross"] (postural control, balance, praxis, strength/endurance).
6) ADLs & Participation: use otCore.ADL plus routine notes (feeding, dressing, toileting, grooming, bathing, sleep, play, school participation).
7) Executive Function & Self-Regulation: attention, initiation, sustained attention, flexibility, working memory, planning/organization, emotional & sensory regulation with examples from notes.
8) Feeding & Oral-Motor: appetite, texture tolerance, chewing, flags (picky, gagging, choking risk, oral-seeking, ARFID) and notes.
9) Risk & Safety: risks selected and mitigation.
10) Clinical Observations: attention to task, transitions, imitation, bilateral use, 1-step/2-step following, plus notes.
11) Strengths & Barriers: write as concise narrative paragraphs.
12) Caregiver Priorities (COPM): include a short table with Problem, Importance, Performance, Satisfaction, Notes (if provided).
13) Goals & Plan: convert GAS entries into goals with the −2…+2 scale and a short SMART paragraph per goal; include frequency, minutes/session, setting, supports, home program highlights.

Guidelines:
- Turn ratings and checkboxes into **clear sentences**; avoid raw numbers unless clinically meaningful (show OT Core indices once).
- Be concise, objective, and clinically sound; avoid repetition; no placeholders.
`;

  const chosenPrompt = isOT ? promptOT : promptADIR;
  const modelData    = isOT ? (otData || {}) : (intakeData || {});

  try {
    const completion = await openai.chat.completions.create({
  model: "gpt-4-1106-preview",
  messages: [
    { role: "system", content: chosenPrompt },
    { role: "user",   content: JSON.stringify(modelData) }
  ],
  temperature: 0.3
});


    const reportText = completion.choices[0].message.content;
    res.json({ report: reportText });

  } catch (error) {
    console.error("OpenAI Error:", error.response?.data || error.message);
    res.status(500).send(error.response?.data || error.message);
  }
});

// ✅ Start server
app.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${process.env.DOMAIN_URL}/success.html`,
      cancel_url: `${process.env.DOMAIN_URL}/cancel.html`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe error:", error.message);
    res.status(500).json({ error: error.message });
  }
});
const PORT = process.env.PORT || 5000;
app.get('/health', (req, res) => res.send('OK'));

app.listen(PORT, () => {
  console.log(`✅ CAAT TOOL backend running on port ${PORT}`);
});
