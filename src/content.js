// All copy on the site. Keep it short and factual.

export const ITEMS = {
  iscr: {
    label: "ISCR · 2026",
    title: "Orbital compute panels",
    meta: "arXiv:2604.07760 · 2026 · with S. Gaalema and C. Staley",
    body: "Solar cells, compute and a vapor-chamber radiator in a single panel.",
    figures: [["~500 W/kg", "about 5× conventional"], ["16 MW", "16,000 panels"], ["1", "Starship launch"]],
    links: [["Paper", "https://arxiv.org/abs/2604.07760"]],
  },
  galaxy: {
    label: "Galaxy",
    title: "EigenGalactic",
    meta: "PCA · Galaxy Zoo 2",
    body: "100 eigengalaxies learned from 4,952 galaxies. Each galaxy is the mean plus a weighted sum of them.",
    links: [["Source", "https://github.com/Sam-Indyk/EigenGalactic"], ["Full explorer", "/demos/eigengalaxy/"]],
  },
  telescope: {
    label: "Deblurring",
    title: "Image deblurring",
    meta: "Richardson–Lucy deconvolution",
    body: "Recovering blurred images: QR codes, pixel art and stacked telescope frames.",
    links: [["Source", "https://github.com/Sam-Indyk/EigenGalactic"]],
    demo: "/demos/deblurring/",
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
    title: "Austin Union Society",
    meta: "President",
    seal: true,
    body: "UATX's debating society, in the tradition of the Oxford Union. Weekly sittings, faculty-led crash courses, open forums and guest debates.",
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
    body: "Startup and market analysis, and the quarterly report on the top 50 portfolio companies.",
  },
  tunnel: {
    label: "The Boring Company",
    title: "The Boring Company",
    meta: "Software Engineering Intern · 2026–",
    body: "Built automated network testing for TBM cameras and switches, and tools for the factory's displays. Supported tunnel operations.",
  },
  dn600: {
    label: "UATXcavators",
    title: "UATXcavators",
    meta: "Team Lead & Mechanical Lead · NABC 2027",
    body: "A 600 mm slurry micro-TBM for the Not-a-Boring Competition, modelled in CadQuery. This is the model.",
    links: [["Source", "https://github.com/Sam-Indyk/uatxcavators-tbm"], ["Control station", "https://github.com/Sam-Indyk/UatxcavatorsGUI"]],
    demo: "/demos/tbm-viewer/",
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

// The Index overlay: plain facts, newest first.
export const INDEX = [
  ["2026–", "The Boring Company", "Software Engineering Intern", "tunnel"],
  ["2026", "Orbital compute panels", "arXiv:2604.07760", "iscr"],
  ["2026", "Polytopia-Zero", "Reinforcement learning", "polytopia"],
  ["2026", "Torchlight", "Hackathon", "capsule"],
  ["2025–", "Austin Union Society", "President", "union"],
  ["2025–", "UATXcavators", "Team Lead & Mechanical Lead", "dn600"],
  ["2025", "White House OSTP", "Policy Intern", "whitehouse"],
  ["2025", "EigenGalactic", "PCA on Galaxy Zoo 2", "galaxy"],
  ["2025", "Image deblurring", "Richardson–Lucy", "telescope"],
  ["2024–25", "8VC", "Defense Team Intern", "rotunda"],
  ["2024–28", "University of Austin", "B.S. Liberal Studies (STEM) · Founders and Lonsdale-Magaro Scholarships"],
  ["", "ARES", "Auction-based course registration", null, "https://github.com/Sam-Indyk/ares_prod"],
  ["", "UATX Marketplace", "Course-matched student marketplace", null, "https://github.com/Sam-Indyk/UATX_WeChat"],
];
