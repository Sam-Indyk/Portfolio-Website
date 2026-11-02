// All copy on the site. Keep it short and factual.

export const ITEMS = {
  iscr: {
    label: "ISCR · AI compute in orbit",
    title: "Reduced-mass orbital AI inference",
    meta: "arXiv:2604.07760 · 2026 · with S. Gaalema and C. Staley",
    body: "The Integrated Solar Compute Radiator: solar cells, vapor-chamber radiators and compute ICs fused into a single panel, for about 500 W/kg of specific power. Modelled the orbital thermal balance, power budget and LLM inference throughput of a 16 MW, 16,000-panel satellite.",
    figures: [["~500 W/kg", "about 5× conventional"], ["16 MW", "16,000 panels"], ["1", "Starship launch"]],
    links: [["Paper", "https://arxiv.org/abs/2604.07760"]],
  },
  galaxy: {
    label: "Galaxy",
    title: "EigenGalactic",
    meta: "PCA · Galaxy Zoo 2",
    body: "100 eigengalaxies learned from 4,952 galaxies. Each galaxy is the mean plus a weighted sum of them.",
    links: [["Source", "https://github.com/Sam-Indyk/EigenGalactic"], ["Full explorer", "/demos/eigengalaxy/index.html"]],
  },
  telescope: {
    label: "Deblurring",
    title: "Image deblurring",
    meta: "Richardson–Lucy deconvolution",
    body: "Recovering blurred images: QR codes, pixel art and stacked telescope frames.",
    links: [["Source", "https://github.com/Sam-Indyk/EigenGalactic"]],
    demo: "/demos/deblurring/index.html",
  },
  capsule: {
    label: "Torchlight · 2026",
    title: "Torchlight",
    meta: "Hackathon · May 2026",
    body: "Individual health-risk profiles for the Inspiration4 crew, from nine NASA OSDR datasets.",
    links: [["Dashboard", "https://torchlightsameitan-d6ydnn3ximwbpt6yiko3gp.streamlit.app/"], ["Source", "https://github.com/Sam-Indyk/Torchlight_SamEitan"]],
  },
  union: {
    label: "Austin Union",
    cta: "Click to vote",
    title: "Austin Union Society",
    meta: "President",
    seal: true,
    motto: "Truth through debate.",
    body: "UATX's student-run society for long-form, adversarial debate, in the tradition of the Oxford Union. You find out what's true by putting it in a room with someone who thinks it's wrong. That is a lot harder to do in a podcast clip or a comment section.",
    docket: [
      ["The weekly sitting", "The gavel opens the meeting, then a short challenge debate, a skills workshop, and a team debate on a motion posted a week in advance."],
      ["Crash courses", "Day-long intensives with UATX faculty on rhetoric and style, building substantive arguments, and rebuttal and cross-examination."],
      ["Open forums and guest debates", "Public nights on hard questions, plus headline speakers from outside the university."],
      ["The institution", "A charter, elections, member matriculation and a term debate competition, so the Union outlasts any one class."],
    ],
    guests: "Guests have included Niall Ferguson, Jonathan Pageau, Phil Magness and Clara Mattei.",
    links: [["austinunion.org", "https://www.austinunion.org"], ["YouTube", "https://www.youtube.com/@AustinUnionSociety"]],
  },
  whitehouse: {
    label: "OSTP · 2025",
    title: "White House OSTP",
    meta: "Policy Intern · Summer 2025",
    body: "Supported executive-order development and public communications in the Office of Science and Technology Policy.",
  },
  rotunda: {
    label: "8VC · 2024",
    title: "8VC",
    meta: "Defense Team Intern · Winter 2024–25",
    body: "Analysis and writing on government-contracting business models, and a quarterly report distributed to LPs.",
  },
  tunnel: {
    label: "The Boring Company",
    title: "The Boring Company",
    meta: "Software Engineering Intern · Bastrop, TX · 2026–",
    body: "Software for the machines and the people who run them.",
    points: [
      "Boreview: an interactive web-based 3D CAD platform that links I/O points to the underlying hardware on TBC's machines, with its own mesh-rendering servers and automated SolidWorks PDM sync.",
      "Continuous network monitoring (MQTT, InfluxDB, Grafana) for the machines' camera and switch networks, with historical uptime and per-port diagnostics.",
      "A factory-wide display system with an interactive map interface and a self-healing kiosk agent.",
      "Machine authentication migrated to Django and PostgreSQL, with training-gated access and role-based permissions.",
      "Depth-camera gap sensing: corrected the rotation maths, engineered a self-cleaning mechanism, and took daily manual tunnel measurements to validate the algorithm.",
    ],
  },
  dn600: {
    label: "UATXcavators",
    title: "UATXcavators",
    meta: "Mechanical and Software Lead · 2026–",
    body: "Primary designer of a 600 mm slurry micro-TBM for The Boring Company's Not-a-Boring Competition, modelled in CadQuery. This is the model.",
    links: [["Source", "https://github.com/Sam-Indyk/uatxcavators-tbm"], ["Control station", "https://github.com/Sam-Indyk/UatxcavatorsGUI"]],
    demo: "/demos/tbm-viewer/index.html",
  },
  controls: {
    label: "Control station",
    title: "Operator interface",
    meta: "UATXcavators · PyQt5 · Modbus TCP · MQTT",
    body: "The station the DN600 is run from: a PyQt5 operator interface that polls a Banner IO-Link master and a Phoenix Contact AXC 2152 PLC over Modbus TCP, drives the machine through its states (power off, init, pre-op warning, idle, running, fault), and publishes telemetry over MQTT for the competition.",
    points: [
      "Overview, Sensors, Controls, Telemetry and Config tabs, with a latching software FAULT button and a stacklight that mirrors the machine.",
      "Conditioning, cutterhead and thrust controls, live only while the machine is running; writes are blocked in fault.",
      "A heartbeat watchdog on the PLC: if the station stops writing for five seconds, the actuator outputs are cut.",
    ],
    links: [["Source", "https://github.com/Sam-Indyk/UatxcavatorsGUI"]],
  },
  polytopia: {
    label: "Polytopia-Zero",
    title: "Polytopia-Zero",
    meta: "Reinforcement learning · 2026",
    body: "A Numba engine for Polytopia and a PPO self-play league, trained from scratch. Below, the trained agent (blue) plays a lookahead bot it never trained against.",
    links: [["Longer game", "/demos/polytopia/replay-long.html"], ["Source", "https://github.com/Sam-Indyk/polytopia-zero"]],
    replay: "/demos/polytopia/replay.html",
  },
};

// Past Austin Union motions, rotated on the chamber's banner and put to visitors. Ids match the
// union_motions rows in supabase/migrations; add a migration when adding one here.
export const UNION_MOTIONS = [
  { id: "christian-nation", title: "Is America a Christian Nation?" },
  { id: "urbanization", title: "Does Urbanization Promote Human Flourishing?" },
  { id: "still-a-republic", title: "Is America Still a Republic?" },
  { id: "enhancement", title: "Are Human Beings Meant to Enhance Themselves?" },
  { id: "political-violence", title: "Is Political Violence Ever Justified?" },
];

// The Index overlay: plain facts, newest first.
export const INDEX = [
  ["2026–", "The Boring Company", "Software Engineering Intern", "tunnel"],
  ["2026–", "UATXcavators", "Mechanical and Software Lead", "dn600"],
  ["2026", "Reduced-mass orbital AI inference", "arXiv:2604.07760", "iscr"],
  ["2026", "Polytopia-Zero", "Reinforcement learning", "polytopia"],
  ["2026", "Torchlight", "Hackathon", "capsule"],
  ["2025–", "Austin Union Society", "President", "union"],
  ["2025", "White House OSTP", "Policy Intern", "whitehouse"],
  ["2025", "EigenGalactic", "PCA on Galaxy Zoo 2", "galaxy"],
  ["2025", "Image deblurring", "Richardson–Lucy", "telescope"],
  ["2024–25", "8VC", "Defense Team Intern", "rotunda"],
  ["2024–28", "University of Austin", "B.S. Liberal Studies, Applied Engineering · Founders and Lonsdale-Magaro Scholarships"],
  ["", "ARES", "Auction-based course registration", null, "https://github.com/Sam-Indyk/ares_prod"],
  ["", "UATX Marketplace", "Course-matched student marketplace", null, "https://github.com/Sam-Indyk/UATX_WeChat"],
];
