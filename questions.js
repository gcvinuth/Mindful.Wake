/**
 * MindfulWake — Question Bank
 * 
 * Categories:
 *  - math: Mental arithmetic and number patterns
 *  - logic: Logical reasoning and deduction
 *  - awareness: Mindfulness and self-awareness prompts
 *  - pattern: Pattern recognition and sequences
 *  - language: Word puzzles and verbal reasoning
 *  - custom: User-imported questions
 * 
 * Each question is a function that generates a random instance,
 * so the user never sees the same question twice.
 */

const QuestionBank = (() => {

    // ── Utility Helpers ──
    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const shuffle = arr => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    };
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    // Generate wrong answers near a correct numeric answer
    const nearbyWrong = (correct, count = 3, minDist = 1, maxDist = 10) => {
        const wrongs = new Set();
        let attempts = 0;
        while (wrongs.size < count && attempts < 100) {
            const offset = rand(minDist, maxDist) * (Math.random() > 0.5 ? 1 : -1);
            const w = correct + offset;
            if (w !== correct && w > 0) wrongs.add(w);
            attempts++;
        }
        // Fill remaining if needed
        while (wrongs.size < count) {
            wrongs.add(correct + wrongs.size + 1);
        }
        return [...wrongs].slice(0, count);
    };

    const formatQ = (question, correct, wrongs, category, explanation) => {
        const options = shuffle([
            { text: String(correct), isCorrect: true },
            ...wrongs.map(w => ({ text: String(w), isCorrect: false }))
        ]);
        return { question, options, category, explanation };
    };

    // ══════════════════════════════════════════
    //  EASY Questions
    // ══════════════════════════════════════════

    const easyGenerators = [
        // Simple addition
        () => {
            const a = rand(12, 49), b = rand(12, 49);
            const ans = a + b;
            return formatQ(
                `What is ${a} + ${b}?`,
                ans, nearbyWrong(ans, 3, 1, 8),
                'math', `${a} + ${b} = ${ans}`
            );
        },
        // Simple multiplication
        () => {
            const a = rand(3, 12), b = rand(3, 12);
            const ans = a * b;
            return formatQ(
                `What is ${a} × ${b}?`,
                ans, nearbyWrong(ans, 3, 1, 12),
                'math', `${a} × ${b} = ${ans}`
            );
        },
        // Next number in simple sequence
        () => {
            const start = rand(2, 10);
            const step = rand(2, 6);
            const seq = [start, start + step, start + step * 2, start + step * 3];
            const ans = start + step * 4;
            return formatQ(
                `What comes next: ${seq.join(', ')}, ?`,
                ans, nearbyWrong(ans, 3, 1, step * 2),
                'pattern', `The pattern adds ${step} each time. Next: ${ans}`
            );
        },
        // Days of the week
        () => {
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            const i = rand(0, 6);
            const shift = rand(2, 4);
            const targetIdx = (i + shift) % 7;
            const wrongs = shuffle(days.filter((_, j) => j !== targetIdx)).slice(0, 3);
            return formatQ(
                `If today is ${days[i]}, what day is it ${shift} days from now?`,
                days[targetIdx], wrongs,
                'logic', `${shift} days after ${days[i]} is ${days[targetIdx]}`
            );
        },
        // Simple percentage
        () => {
            const base = pick([50, 100, 200, 250, 400, 500]);
            const pct = pick([10, 20, 25, 50]);
            const ans = (base * pct) / 100;
            return formatQ(
                `What is ${pct}% of ${base}?`,
                ans, nearbyWrong(ans, 3, 1, Math.max(5, Math.round(ans * 0.3))),
                'math', `${pct}% of ${base} = ${ans}`
            );
        },
        // Counting vowels
        () => {
            const words = [
                { word: 'EDUCATION', vowels: 5 },
                { word: 'BEAUTIFUL', vowels: 5 },
                { word: 'STRENGTH', vowels: 1 },
                { word: 'ALGORITHM', vowels: 3 },
                { word: 'UMBRELLA', vowels: 3 },
                { word: 'ORCHESTRA', vowels: 3 },
                { word: 'KNOWLEDGE', vowels: 3 },
                { word: 'BUTTERFLY', vowels: 2 },
                { word: 'CHALLENGE', vowels: 2 },
                { word: 'APPRECIATE', vowels: 5 },
            ];
            const w = pick(words);
            return formatQ(
                `How many vowels (A, E, I, O, U) are in the word "${w.word}"?`,
                w.vowels, nearbyWrong(w.vowels, 3, 1, 2),
                'language', `The vowels in "${w.word}" count to ${w.vowels}`
            );
        },
        // Awareness - current time estimation
        () => {
            const options = [
                {
                    q: "Which of these is a proven benefit of waking up early?",
                    correct: "Better mental clarity and focus",
                    wrongs: ["Increased need for caffeine", "Lower body temperature all day", "Reduced dream frequency"],
                    explain: "Early rising aligns with cortisol cycles, boosting mental clarity."
                },
                {
                    q: "What is the first thing experts recommend doing after waking up?",
                    correct: "Hydrate with a glass of water",
                    wrongs: ["Check social media", "Have a coffee immediately", "Do intense exercise"],
                    explain: "Your body is dehydrated after sleep. Water kickstarts metabolism."
                },
                {
                    q: "How many hours of sleep does the average adult need?",
                    correct: "7-9 hours",
                    wrongs: ["4-5 hours", "10-12 hours", "5-6 hours"],
                    explain: "The National Sleep Foundation recommends 7-9 hours for adults."
                },
                {
                    q: "What hormone helps regulate your sleep-wake cycle?",
                    correct: "Melatonin",
                    wrongs: ["Insulin", "Adrenaline", "Testosterone"],
                    explain: "Melatonin is produced by the pineal gland and signals sleep time."
                }
            ];
            const o = pick(options);
            return formatQ(o.q, o.correct, o.wrongs, 'awareness', o.explain);
        },
        // Subtraction
        () => {
            const a = rand(50, 150), b = rand(10, a - 1);
            const ans = a - b;
            return formatQ(
                `What is ${a} − ${b}?`,
                ans, nearbyWrong(ans, 3, 1, 10),
                'math', `${a} − ${b} = ${ans}`
            );
        },
    ];

    // ══════════════════════════════════════════
    //  MEDIUM Questions
    // ══════════════════════════════════════════

    const mediumGenerators = [
        // Two-step arithmetic
        () => {
            const a = rand(10, 30), b = rand(5, 15), c = rand(2, 8);
            const ans = a * b - c;
            return formatQ(
                `Solve: ${a} × ${b} − ${c} = ?`,
                ans, nearbyWrong(ans, 3, 2, 15),
                'math', `${a} × ${b} = ${a * b}, then − ${c} = ${ans}`
            );
        },
        // Fraction to percentage
        () => {
            const fracs = [
                { num: 3, den: 4, pct: 75 },
                { num: 2, den: 5, pct: 40 },
                { num: 1, den: 8, pct: 12.5 },
                { num: 5, den: 8, pct: 62.5 },
                { num: 3, den: 5, pct: 60 },
                { num: 7, den: 10, pct: 70 },
                { num: 1, den: 3, pct: 33.3 },
                { num: 2, den: 3, pct: 66.7 },
            ];
            const f = pick(fracs);
            const wrongs = nearbyWrong(f.pct, 3, 5, 20).map(w => w % 1 === 0 ? w : Number(w.toFixed(1)));
            return formatQ(
                `What is ${f.num}/${f.den} expressed as a percentage?`,
                f.pct + '%', wrongs.map(w => w + '%'),
                'math', `${f.num}/${f.den} = ${f.pct}%`
            );
        },
        // Fibonacci-like sequence
        () => {
            const a = rand(1, 5), b = rand(1, 5);
            const seq = [a, b, a + b, b + (a + b), (a + b) + (b + (a + b))];
            const ans = seq[3] + seq[4];
            return formatQ(
                `Each number is the sum of the two before it: ${seq.join(', ')}, ?`,
                ans, nearbyWrong(ans, 3, 1, 8),
                'pattern', `${seq[3]} + ${seq[4]} = ${ans}`
            );
        },
        // Logic puzzle
        () => {
            const puzzles = [
                {
                    q: "If all roses are flowers, and some flowers fade quickly, which MUST be true?",
                    correct: "All roses are flowers",
                    wrongs: ["All flowers are roses", "Some roses fade quickly", "No roses fade quickly"],
                    explain: "Only the original premise ('all roses are flowers') is guaranteed true."
                },
                {
                    q: "A clock shows 3:15. What is the angle between the hour and minute hands?",
                    correct: "7.5 degrees",
                    wrongs: ["0 degrees", "15 degrees", "90 degrees"],
                    explain: "At 3:15, the minute hand is at 90° and the hour hand is at 97.5°, making 7.5°."
                },
                {
                    q: "If you overtake the person in 2nd place in a race, what position are you in?",
                    correct: "2nd place",
                    wrongs: ["1st place", "3rd place", "It depends on the race"],
                    explain: "You take their position (2nd), you don't jump to 1st."
                },
                {
                    q: "A bat and a ball cost $1.10 together. The bat costs $1.00 more than the ball. How much does the ball cost?",
                    correct: "$0.05",
                    wrongs: ["$0.10", "$0.15", "$0.01"],
                    explain: "Ball = $0.05, Bat = $1.05. Difference is $1.00, total is $1.10."
                },
                {
                    q: "If it takes 5 machines 5 minutes to make 5 widgets, how long would it take 100 machines to make 100 widgets?",
                    correct: "5 minutes",
                    wrongs: ["100 minutes", "1 minute", "50 minutes"],
                    explain: "Each machine makes 1 widget in 5 min. 100 machines make 100 widgets in 5 min."
                },
            ];
            return { ...pick(puzzles), category: 'logic' };
        },
        // Missing letter in pattern
        () => {
            const patterns = [
                { seq: ['A', 'C', 'E', 'G', '?'], answer: 'I', explain: 'Skip one letter: A→C→E→G→I' },
                { seq: ['Z', 'X', 'V', 'T', '?'], answer: 'R', explain: 'Go back by 2: Z→X→V→T→R' },
                { seq: ['B', 'D', 'F', 'H', '?'], answer: 'J', explain: 'Every other letter: B→D→F→H→J' },
                { seq: ['A', 'B', 'D', 'G', '?'], answer: 'K', explain: 'Gaps increase: +1, +2, +3, +4 → K' },
            ];
            const p = pick(patterns);
            const allLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const wrongs = shuffle(allLetters.split('').filter(l => l !== p.answer && !p.seq.includes(l))).slice(0, 3);
            return formatQ(
                `What letter comes next: ${p.seq.join(', ')}`,
                p.answer, wrongs,
                'pattern', p.explain
            );
        },
        // Mindfulness awareness
        () => {
            const questions = [
                {
                    q: "What does the '20-20-20 rule' help prevent?",
                    correct: "Eye strain from screens",
                    wrongs: ["Memory loss", "Weight gain", "Joint stiffness"],
                    explain: "Every 20 min, look at something 20 feet away for 20 seconds."
                },
                {
                    q: "Which breathing technique is commonly used for quick stress relief?",
                    correct: "4-7-8 breathing",
                    wrongs: ["10-10-10 breathing", "Rapid shallow breathing", "Holding breath for 30s"],
                    explain: "Inhale 4s, hold 7s, exhale 8s — activates the parasympathetic nervous system."
                },
                {
                    q: "What is 'sleep inertia'?",
                    correct: "Grogginess felt right after waking up",
                    wrongs: ["Inability to fall asleep", "Dreaming while awake", "Sleeping too much"],
                    explain: "Sleep inertia is the transitional state between sleep and wakefulness."
                },
                {
                    q: "Which part of the brain is responsible for decision-making and focus?",
                    correct: "Prefrontal cortex",
                    wrongs: ["Cerebellum", "Amygdala", "Hippocampus"],
                    explain: "The prefrontal cortex handles executive functions like planning and focus."
                },
                {
                    q: "What is the recommended duration for a power nap to avoid grogginess?",
                    correct: "10-20 minutes",
                    wrongs: ["45-60 minutes", "5 minutes or less", "30-40 minutes"],
                    explain: "10-20 min keeps you in light sleep, avoiding deep sleep grogginess."
                }
            ];
            const o = pick(questions);
            return formatQ(o.q, o.correct, o.wrongs, 'awareness', o.explain);
        },
        // Reverse calculation
        () => {
            const product = pick([120, 144, 156, 180, 210, 240, 300, 360]);
            const a = rand(2, 12);
            if (product % a !== 0) return mediumGenerators[0](); // fallback
            const ans = product / a;
            return formatQ(
                `If ${a} × ? = ${product}, what is the missing number?`,
                ans, nearbyWrong(ans, 3, 1, 10),
                'math', `${product} ÷ ${a} = ${ans}`
            );
        },
        // Analogies
        () => {
            const analogies = [
                { q: 'Pen is to Writer as Brush is to _____', correct: 'Painter', wrongs: ['Singer', 'Builder', 'Dancer'] },
                { q: 'Fish is to Water as Bird is to _____', correct: 'Air', wrongs: ['Tree', 'Nest', 'Ground'] },
                { q: 'Eye is to See as Ear is to _____', correct: 'Hear', wrongs: ['Smell', 'Touch', 'Taste'] },
                { q: 'Page is to Book as Key is to _____', correct: 'Keyboard', wrongs: ['Lock', 'Door', 'Safe'] },
                { q: 'Seed is to Tree as Egg is to _____', correct: 'Bird', wrongs: ['Nest', 'Shell', 'Breakfast'] },
            ];
            const a = pick(analogies);
            return formatQ(a.q, a.correct, a.wrongs, 'language', `Analogy: ${a.correct} completes the relationship.`);
        },
    ];

    // ══════════════════════════════════════════
    //  HARD Questions
    // ══════════════════════════════════════════

    const hardGenerators = [
        // Multi-step arithmetic
        () => {
            const a = rand(12, 25), b = rand(3, 9), c = rand(10, 30), d = rand(2, 5);
            const ans = (a * b) + (c * d);
            return formatQ(
                `Solve: (${a} × ${b}) + (${c} × ${d}) = ?`,
                ans, nearbyWrong(ans, 3, 5, 25),
                'math', `(${a}×${b}) + (${c}×${d}) = ${a * b} + ${c * d} = ${ans}`
            );
        },
        // Square roots and powers
        () => {
            const bases = [
                { n: 144, root: 12 }, { n: 169, root: 13 }, { n: 196, root: 14 },
                { n: 225, root: 15 }, { n: 256, root: 16 }, { n: 289, root: 17 },
                { n: 324, root: 18 }, { n: 361, root: 19 }, { n: 625, root: 25 },
            ];
            const b = pick(bases);
            return formatQ(
                `What is the square root of ${b.n}?`,
                b.root, nearbyWrong(b.root, 3, 1, 4),
                'math', `√${b.n} = ${b.root}`
            );
        },
        // Complex pattern
        () => {
            const patterns = [
                { seq: [1, 1, 2, 3, 5, 8, 13], ans: 21, explain: 'Fibonacci: each number is sum of previous two' },
                { seq: [2, 6, 18, 54], ans: 162, explain: 'Geometric: multiply by 3 each time' },
                { seq: [1, 4, 9, 16, 25], ans: 36, explain: 'Perfect squares: 1², 2², 3², 4², 5², 6²' },
                { seq: [1, 8, 27, 64], ans: 125, explain: 'Perfect cubes: 1³, 2³, 3³, 4³, 5³' },
                { seq: [2, 3, 5, 7, 11, 13], ans: 17, explain: 'Prime numbers sequence' },
            ];
            const p = pick(patterns);
            return formatQ(
                `What comes next in the sequence: ${p.seq.join(', ')}, ?`,
                p.ans, nearbyWrong(p.ans, 3, 1, Math.max(3, Math.round(p.ans * 0.15))),
                'pattern', p.explain
            );
        },
        // Advanced logic
        () => {
            const questions = [
                {
                    q: "Three switches control three light bulbs in another room. You can flip switches all you want but visit the room only once. How can you identify which switch controls which bulb?",
                    correct: "Turn on switch 1, wait, turn it off, turn on switch 2, then visit",
                    wrongs: [
                        "Turn all switches on and visit",
                        "It's impossible with one visit",
                        "Turn switches on one at a time"
                    ],
                    explain: "Switch 1 (warm but off), Switch 2 (on), Switch 3 (cold and off)."
                },
                {
                    q: "You have 8 balls of equal size. One is slightly heavier. Using a balance scale, what is the minimum number of weighings needed to find it?",
                    correct: "2",
                    wrongs: ["3", "4", "1"],
                    explain: "Split into 3-3-2. Compare groups of 3. Then narrow down with one more weighing."
                },
                {
                    q: "If A > B, B > C, and C > D, which of the following MUST be true?",
                    correct: "A > D",
                    wrongs: ["D > A", "B = C", "A = D"],
                    explain: "By transitivity: A > B > C > D, so A > D."
                },
                {
                    q: "A lily pad doubles in size every day. If it takes 48 days to cover a lake, on what day does it cover half the lake?",
                    correct: "Day 47",
                    wrongs: ["Day 24", "Day 46", "Day 36"],
                    explain: "Since it doubles daily, it's half-covered the day before being fully covered."
                },
            ];
            const o = pick(questions);
            return formatQ(o.q, o.correct, o.wrongs, 'logic', o.explain);
        },
        // Verbal reasoning
        () => {
            const questions = [
                {
                    q: "Which word does NOT belong: Apple, Banana, Tomato, Cherry?",
                    correct: "Tomato",
                    wrongs: ["Apple", "Banana", "Cherry"],
                    explain: "Tomato is botanically a fruit but culinarily a vegetable, unlike the others which are commonly fruits."
                },
                {
                    q: "What word becomes shorter when you add two letters to it?",
                    correct: "Short",
                    wrongs: ["Long", "Small", "Tiny"],
                    explain: "'Short' + 'er' = 'Shorter' — the word literally becomes 'shorter'!"
                },
                {
                    q: "Rearrange: 'CIFAIPC' → A large body of water",
                    correct: "PACIFIC",
                    wrongs: ["ATLANTIC", "GLACIAL", "CAPITAL"],
                    explain: "CIFAIPC unscrambles to PACIFIC."
                },
                {
                    q: "I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?",
                    correct: "A map",
                    wrongs: ["A painting", "A dream", "A book"],
                    explain: "A map has representations of cities, mountains, water — but not the real things."
                }
            ];
            const o = pick(questions);
            return formatQ(o.q, o.correct, o.wrongs, 'language', o.explain);
        },
        // Time calculation
        () => {
            const hourA = rand(1, 11);
            const minA = rand(0, 5) * 10;
            const addHour = rand(2, 8);
            const addMin = rand(1, 5) * 10;
            let totalMin = (hourA * 60 + minA) + (addHour * 60 + addMin);
            const ansHour = Math.floor(totalMin / 60) % 12 || 12;
            const ansMin = totalMin % 60;
            const ampm = totalMin >= 720 ? 'PM' : 'AM';
            const ansStr = `${ansHour}:${String(ansMin).padStart(2, '0')} ${ampm}`;
            const wrongs = [
                `${((ansHour) % 12) + 1}:${String(ansMin).padStart(2, '0')} ${ampm}`,
                `${ansHour}:${String((ansMin + 10) % 60).padStart(2, '0')} ${ampm}`,
                `${((ansHour + 1) % 12) + 1}:${String((ansMin + 20) % 60).padStart(2, '0')} ${ampm === 'AM' ? 'PM' : 'AM'}`,
            ];
            return formatQ(
                `If it's ${hourA}:${String(minA).padStart(2, '0')} AM and you add ${addHour} hours and ${addMin} minutes, what time is it?`,
                ansStr, wrongs,
                'math', `${hourA}:${String(minA).padStart(2, '0')} + ${addHour}h ${addMin}m = ${ansStr}`
            );
        },
        // Deep awareness
        () => {
            const questions = [
                {
                    q: "What is 'neuroplasticity'?",
                    correct: "The brain's ability to reorganize and form new connections",
                    wrongs: ["A type of brain surgery", "A mental illness", "The hardening of brain tissue"],
                    explain: "Neuroplasticity allows the brain to adapt and learn throughout life."
                },
                {
                    q: "The 'flow state' is best described as:",
                    correct: "Being fully immersed and focused on an activity",
                    wrongs: ["Feeling sleepy and relaxed", "Multi-tasking efficiently", "Daydreaming productively"],
                    explain: "Flow state (coined by Csikszentmihalyi) is optimal focus where time seems to stop."
                },
                {
                    q: "What is the 'Zeigarnik Effect'?",
                    correct: "Uncompleted tasks are remembered better than completed ones",
                    wrongs: ["Completed tasks feel more satisfying", "People forget tasks when interrupted", "Work expands to fill available time"],
                    explain: "The Zeigarnik Effect explains why unfinished tasks nag our memory."
                },
                {
                    q: "Which practice is scientifically shown to increase gray matter in the brain?",
                    correct: "Meditation",
                    wrongs: ["Watching educational videos", "Drinking coffee", "Sleeping more than 12 hours"],
                    explain: "Regular meditation increases gray matter density in areas related to learning and memory."
                }
            ];
            const o = pick(questions);
            return formatQ(o.q, o.correct, o.wrongs, 'awareness', o.explain);
        },
        // Percentage increase
        () => {
            const original = pick([80, 120, 150, 200, 250]);
            const pctIncrease = pick([15, 20, 25, 30, 40]);
            const ans = original + (original * pctIncrease / 100);
            return formatQ(
                `A price of $${original} increases by ${pctIncrease}%. What is the new price?`,
                '$' + ans, nearbyWrong(ans, 3, 5, 20).map(w => '$' + w),
                'math', `$${original} + ${pctIncrease}% = $${original} + $${original * pctIncrease / 100} = $${ans}`
            );
        },
    ];

    // ══════════════════════════════════════════
    //  CUSTOM QUESTIONS (user-imported)
    // ══════════════════════════════════════════

    const CUSTOM_STORAGE_KEY = 'mindfulwake_custom_questions';

    function getCustomQuestions() {
        try {
            const data = localStorage.getItem(CUSTOM_STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.warn('Error loading custom questions:', e);
            return [];
        }
    }

    function saveCustomQuestions(questions) {
        try {
            localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(questions));
        } catch (e) {
            console.warn('Error saving custom questions:', e);
        }
    }

    function addCustomQuestion(questionObj) {
        const customs = getCustomQuestions();
        customs.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            question: questionObj.question,
            options: questionObj.options, // array of {text, isCorrect}
            category: 'custom',
            explanation: questionObj.explanation || '',
            addedAt: Date.now(),
        });
        saveCustomQuestions(customs);
        return customs;
    }

    function addCustomQuestions(questionArr) {
        const customs = getCustomQuestions();
        for (const q of questionArr) {
            customs.push({
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                question: q.question,
                options: q.options,
                category: 'custom',
                explanation: q.explanation || '',
                addedAt: Date.now(),
            });
        }
        saveCustomQuestions(customs);
        return customs;
    }

    function deleteCustomQuestion(id) {
        let customs = getCustomQuestions();
        customs = customs.filter(q => q.id !== id);
        saveCustomQuestions(customs);
        return customs;
    }

    function clearCustomQuestions() {
        saveCustomQuestions([]);
    }

    function exportCustomQuestions() {
        const customs = getCustomQuestions();
        let text = '';
        for (const q of customs) {
            text += `Q: ${q.question}\n`;
            const letters = ['A', 'B', 'C', 'D'];
            q.options.forEach((opt, i) => {
                text += `${letters[i]}) ${opt.text}${opt.isCorrect ? ' *' : ''}\n`;
            });
            if (q.explanation) text += `Explanation: ${q.explanation}\n`;
            text += '\n';
        }
        return text;
    }

    // ══════════════════════════════════════════
    //  FILE PARSING
    // ══════════════════════════════════════════

    /**
     * Parse MCQ text from any source (PDF text, OCR text, docx text, etc.)
     * Expects the format:
     *   Q: question text
     *   A) option text *   (asterisk marks correct)
     *   B) option text
     *   C) option text
     *   D) option text
     * 
     * Also supports:
     *   - "correct: B" or "answer: B" after options
     *   - Numbered questions (1. or 1) or Q1: )
     *   - Options with just a-d or 1-4 prefix
     */
    function parseQuestionText(text) {
        const questions = [];
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        let currentQ = null;
        let currentOptions = [];
        let correctIndex = -1;
        
        const questionPatterns = [
            /^Q\s*[:.)]\s*(.+)/i,
            /^(?:Question\s*)?(\d+)\s*[:.)\]]\s*(.+)/i,
            /^\*\*Q\s*[:.)]\s*(.+)\*\*/i,
        ];
        
        const optionPatterns = [
            /^([A-Da-d])\s*[.):\]]\s*(.+)/,
            /^([1-4])\s*[.):\]]\s*(.+)/,
        ];
        
        const correctPatterns = [
            /^(?:correct|answer|ans)\s*[:=]\s*([A-Da-d1-4])/i,
        ];
        
        function flushQuestion() {
            if (currentQ && currentOptions.length >= 2) {
                // If no correct answer marked, mark the first one
                if (correctIndex === -1) {
                    correctIndex = 0;
                }
                const options = currentOptions.map((opt, i) => ({
                    text: opt.text.replace(/\s*\*+\s*$/, '').trim(),
                    isCorrect: i === correctIndex,
                }));
                questions.push({
                    question: currentQ,
                    options: options,
                    explanation: '',
                });
            }
            currentQ = null;
            currentOptions = [];
            correctIndex = -1;
        }
        
        for (const line of lines) {
            // Check if it's a question line
            let isQuestion = false;
            for (const pat of questionPatterns) {
                const m = line.match(pat);
                if (m) {
                    flushQuestion();
                    currentQ = (m[2] || m[1]).trim();
                    isQuestion = true;
                    break;
                }
            }
            if (isQuestion) continue;
            
            // Check if it's an option line
            let isOption = false;
            for (const pat of optionPatterns) {
                const m = line.match(pat);
                if (m) {
                    const optText = m[2].trim();
                    const isCorrect = optText.includes('*') || optText.toLowerCase().includes('(correct)');
                    if (isCorrect) correctIndex = currentOptions.length;
                    currentOptions.push({ text: optText.replace(/\s*\*+\s*$/g, '').replace(/\s*\(correct\)\s*/gi, '').trim() });
                    isOption = true;
                    break;
                }
            }
            if (isOption) continue;
            
            // Check if it's a correct answer indicator
            for (const pat of correctPatterns) {
                const m = line.match(pat);
                if (m) {
                    const indicator = m[1].toUpperCase();
                    if ('ABCD'.includes(indicator)) {
                        correctIndex = 'ABCD'.indexOf(indicator);
                    } else if ('1234'.includes(indicator)) {
                        correctIndex = parseInt(indicator) - 1;
                    }
                    break;
                }
            }
            
            // If we have a question but no options yet, it might be a multi-line question
            if (currentQ && currentOptions.length === 0 && !line.match(/^(explanation|correct|answer|ans)\s*[:=]/i)) {
                currentQ += ' ' + line;
            }
        }
        
        // Flush last question
        flushQuestion();
        
        return questions;
    }

    /**
     * Parse a PDF file into text, then extract MCQs
     */
    async function parsePDF(file, onProgress) {
        if (!window.pdfjsLib) {
            throw new Error('PDF.js not loaded');
        }
        
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let fullText = '';
        const totalPages = pdf.numPages;
        
        for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
            if (onProgress) onProgress(Math.round((i / totalPages) * 80));
        }
        
        if (onProgress) onProgress(90);
        const questions = parseQuestionText(fullText);
        if (onProgress) onProgress(100);
        
        return questions;
    }

    /**
     * Parse an image file using Tesseract.js OCR
     */
    async function parseImage(file, onProgress) {
        if (!window.Tesseract) {
            throw new Error('Tesseract.js not loaded');
        }
        
        if (onProgress) onProgress(10);
        
        const result = await Tesseract.recognize(file, 'eng', {
            logger: m => {
                if (m.status === 'recognizing text' && onProgress) {
                    onProgress(10 + Math.round(m.progress * 70));
                }
            }
        });
        
        if (onProgress) onProgress(90);
        const questions = parseQuestionText(result.data.text);
        if (onProgress) onProgress(100);
        
        return questions;
    }

    /**
     * Parse a DOCX file using Mammoth.js
     */
    async function parseDOCX(file, onProgress) {
        if (!window.mammoth) {
            throw new Error('Mammoth.js not loaded');
        }
        
        if (onProgress) onProgress(20);
        
        const arrayBuffer = await file.arrayBuffer();
        if (onProgress) onProgress(40);
        
        const result = await mammoth.extractRawText({ arrayBuffer });
        if (onProgress) onProgress(80);
        
        const questions = parseQuestionText(result.value);
        if (onProgress) onProgress(100);
        
        return questions;
    }

    /**
     * Parse a plain text file
     */
    async function parseText(file, onProgress) {
        if (onProgress) onProgress(30);
        const text = await file.text();
        if (onProgress) onProgress(70);
        const questions = parseQuestionText(text);
        if (onProgress) onProgress(100);
        return questions;
    }

    /**
     * Main file parser — routes to the correct parser based on file type
     */
    async function parseFile(file, onProgress) {
        const ext = file.name.split('.').pop().toLowerCase();
        
        switch (ext) {
            case 'pdf':
                return await parsePDF(file, onProgress);
            case 'png':
            case 'jpg':
            case 'jpeg':
            case 'webp':
            case 'bmp':
            case 'gif':
                return await parseImage(file, onProgress);
            case 'docx':
            case 'doc':
                return await parseDOCX(file, onProgress);
            case 'txt':
            case 'md':
            case 'csv':
                return await parseText(file, onProgress);
            default:
                throw new Error(`Unsupported file type: .${ext}`);
        }
    }

    // ══════════════════════════════════════════
    //  Public API
    // ══════════════════════════════════════════

    const generators = {
        easy: easyGenerators,
        medium: mediumGenerators,
        hard: hardGenerators,
    };

    // Generate N unique questions for a given difficulty
    function generate(difficulty, count) {
        const gens = generators[difficulty] || generators.medium;
        const questions = [];
        const usedIndices = new Set();
        let attempts = 0;

        while (questions.length < count && attempts < count * 10) {
            const idx = Math.floor(Math.random() * gens.length);
            // Allow reuse of generators but try variety first
            if (usedIndices.size < gens.length) {
                if (usedIndices.has(idx)) { attempts++; continue; }
            }
            usedIndices.add(idx);
            try {
                const q = gens[idx]();
                if (q && q.question) {
                    questions.push(q);
                }
            } catch (e) {
                console.warn('Question generation error:', e);
            }
            attempts++;
        }

        // Fill remaining with random if needed
        while (questions.length < count) {
            const gen = pick(gens);
            try {
                const q = gen();
                if (q && q.question) questions.push(q);
            } catch (e) {
                console.warn('Fill error:', e);
            }
        }

        return questions;
    }

    /**
     * Generate questions from custom pool
     */
    function generateCustom(count) {
        const customs = getCustomQuestions();
        if (customs.length === 0) return [];
        
        const shuffled = shuffle([...customs]);
        const selected = [];
        
        for (let i = 0; i < count; i++) {
            const q = shuffled[i % shuffled.length];
            selected.push({
                question: q.question,
                options: shuffle([...q.options]),
                category: 'custom',
                explanation: q.explanation || '',
            });
        }
        
        return selected;
    }

    /**
     * Generate mixed questions (half built-in, half custom)
     */
    function generateMixed(difficulty, count) {
        const customs = getCustomQuestions();
        if (customs.length === 0) return generate(difficulty, count);
        
        const customCount = Math.min(Math.ceil(count / 2), customs.length);
        const builtinCount = count - customCount;
        
        const customQs = generateCustom(customCount);
        const builtinQs = generate(difficulty, builtinCount);
        
        return shuffle([...customQs, ...builtinQs]);
    }

    // Morning motivational quotes
    const morningQuotes = [
        { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
        { text: "Every morning brings new potential, but if you dwell on the misfortunes of the day before, you tend to overlook tremendous opportunities.", author: "Harvey Mackay" },
        { text: "An early-morning walk is a blessing for the whole day.", author: "Henry David Thoreau" },
        { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
        { text: "Today is a new day. Don't let your history interfere with your destiny.", author: "Steve Maraboli" },
        { text: "Write it on your heart that every day is the best day in the year.", author: "Ralph Waldo Emerson" },
        { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
        { text: "Your limitation—it's only your imagination.", author: "Unknown" },
        { text: "Push yourself, because no one else is going to do it for you.", author: "Unknown" },
        { text: "Great things never come from comfort zones.", author: "Unknown" },
        { text: "Wake up with determination. Go to bed with satisfaction.", author: "Unknown" },
        { text: "Don't stop when you're tired. Stop when you're done.", author: "Unknown" },
        { text: "The harder you work for something, the greater you'll feel when you achieve it.", author: "Unknown" },
        { text: "Dream it. Wish it. Do it.", author: "Unknown" },
        { text: "Success doesn't just find you. You have to go out and get it.", author: "Unknown" },
    ];

    function getQuote() {
        return pick(morningQuotes);
    }

    const categoryInfo = {
        math: { icon: '🔢', name: 'Math' },
        logic: { icon: '🧠', name: 'Logic' },
        awareness: { icon: '🧘', name: 'Awareness' },
        pattern: { icon: '🔗', name: 'Pattern' },
        language: { icon: '📝', name: 'Language' },
        custom: { icon: '⭐', name: 'Custom' },
    };

    function getCategoryInfo(cat) {
        return categoryInfo[cat] || { icon: '❓', name: 'General' };
    }

    return {
        generate,
        generateCustom,
        generateMixed,
        getQuote,
        getCategoryInfo,
        // Custom question management
        getCustomQuestions,
        saveCustomQuestions,
        addCustomQuestion,
        addCustomQuestions,
        deleteCustomQuestion,
        clearCustomQuestions,
        exportCustomQuestions,
        // File parsing
        parseFile,
        parseQuestionText,
    };

})();
