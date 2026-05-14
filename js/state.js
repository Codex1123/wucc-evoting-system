

// ═══════════════════════════════════════════════════════════════
//  WELLSPRING WUCC v6 — COMPLETE JS ENGINE
// ═══════════════════════════════════════════════════════════════

// ── STATE ──────────────────────────────────────────────────────
var S = {
  electionActive:false, electionStatus:'draft', electionTitle:'WUCC Computing Election 2025/2026',
  electionStart:null, electionEnd:null,
  currentUser:null, selections:{}, lastTxHash:'', lastBlock:0,
  blockNum:1200, totalVotes:0, voterStats:null, activityLog:[], applications:[],
  txLog:[], adminRole:null, adminName:'', _pendingPhoto:null,
  voters:[
    {name:'Emeka Okafor',     matric:'COSC/21045',dept:'Computer Science',     level:'300L',email:'emeka@wucc.edu.ng',     status:'approved',hasVoted:false},
    {name:'Chidinma Eze',     matric:'COSC/20312',dept:'Computer Science',     level:'400L',email:'chidinma@wucc.edu.ng', status:'approved',hasVoted:false},
    {name:'Abdullahi Musa',   matric:'SE/21188',  dept:'Software Engineering', level:'300L',email:'abdullahi@wucc.edu.ng',status:'pending', hasVoted:false},
    {name:'Blessing Adeyemi', matric:'CYB/21007', dept:'Cyber Security',       level:'400L',email:'blessing@wucc.edu.ng', status:'approved',hasVoted:false},
    {name:'Tunde Bakare',     matric:'IT/20445',  dept:'Information Technology',level:'500L',email:'tunde@wucc.edu.ng',   status:'approved',hasVoted:false},
    {name:'Ngozi Obi',        matric:'COSC/21220',dept:'Computer Science',     level:'300L',email:'ngozi@wucc.edu.ng',    status:'approved',hasVoted:false},
    {name:'Chukwuemeka Nwosu',matric:'SE/22015',  dept:'Software Engineering', level:'200L',email:'chukwu@wucc.edu.ng',  status:'approved',hasVoted:false},
    {name:'Fatima Abubakar',  matric:'CYB/22101', dept:'Cyber Security',       level:'200L',email:'fatima@wucc.edu.ng',  status:'approved',hasVoted:false},
    {name:'Samuel Adeyemi',   matric:'IT/21456',  dept:'Information Technology',level:'300L',email:'samuel@wucc.edu.ng', status:'approved',hasVoted:false},
    {name:'Ifeoma Okonkwo',   matric:'COSC/21105',dept:'Computer Science',     level:'400L',email:'ifeoma@wucc.edu.ng',  status:'approved',hasVoted:false},
  ],
  positions:[
    {key:'pres',  icon:'👑', name:'Governor, WUCC',             votes:[],candidates:[
      {name:'Emeka Okafor',         id:'COSC/21045',bio:'Final year Computer Science student, former class representative and tech community lead.',manifesto:'Free internet access for all students, a Department tech hub, and fully digital administrative processes.',promises:['Campus-wide Wi-Fi','Department tech hub','Digital admin portal'],emoji:'👨🏿‍🎓',photo:null},
      {name:'Chidinma Eze',         id:'COSC/20312',bio:'400L Computer Science student with strong leadership in the Women in Tech initiative.',manifesto:'Transparent finances, improved welfare packages, and a Women-in-Tech scholarship fund.',promises:['Quarterly financial reports','Women-in-Tech fund','Welfare packages'],emoji:'👩🏿‍🎓',photo:null},
      {name:'Abdullahi Musa',       id:'SE/21188',  bio:'Software Engineering student and student rights advocate, passionate about fair governance.',manifesto:'A WUCC Bill of Rights, fair disciplinary processes, and a reformed council constitution.',promises:['Student Bill of Rights','WUCC constitution review','Fair hearing process'],emoji:'👨🏾‍💼',photo:null},
    ]},
    {key:'vp',    icon:'🥇', name:'Deputy Governor',             votes:[],candidates:[
      {name:'Blessing Adeyemi',     id:'CYB/21007', bio:'Cyber Security student passionate about student safety and digital wellness.',manifesto:'Mental health support, a cybersecurity awareness campaign, and improved student welfare.',promises:['Mental health desk','Cyber awareness workshops','Welfare fund'],emoji:'👩🏽‍🎓',photo:null},
      {name:'Tunde Bakare',         id:'IT/20445',  bio:'Final year IT student and certified project management associate.',manifesto:'Student project funding scheme, industry linkages, and a computing internship portal.',promises:['Project funding scheme','Industry linkages','Internship portal'],emoji:'👨🏿‍💻',photo:null},
    ]},
    {key:'gsec',  icon:'📋', name:'General Secretary',            votes:[],candidates:[
      {name:'Ifeoma Nwosu',         id:'COSC/21334',bio:'Computer Science student and skilled technical writer with department newsletter experience.',manifesto:'Digitalise all WUCC records, publish public meeting minutes, and streamline communications.',promises:['Digital record system','Public meeting minutes','Streamlined comms'],emoji:'👩🏾‍🔬',photo:null},
      {name:'Chukwuma Ike',         id:'SE/22015',  bio:'Software Engineering student with open-source documentation experience.',manifesto:'A transparent WUCC information portal and improved faculty correspondence.',promises:['WUCC info portal','Faculty comms','Transparent minutes'],emoji:'👨🏿‍📚',photo:null},
    ]},
    {key:'agsec', icon:'📝', name:'Asst. General Secretary',      votes:[],candidates:[
      {name:'Amaka Ugwu',           id:'IT/22101',  bio:'Information Technology student with strong administrative and records management skills.',manifesto:'Support the General Secretary, maintain accurate records, and improve the WUCC filing system.',promises:['Accurate records','Improved filing','Admin support'],emoji:'👩🏿‍💼',photo:null},
      {name:'Ibrahim Sule',         id:'CYB/21456', bio:'Cyber Security student and certified digital forensics associate.',manifesto:'Digital minute-taking, improved WUCC archiving, and secure digital correspondence.',promises:['Digital minutes','WUCC archiving','Secure correspondence'],emoji:'👨🏾‍💼',photo:null},
    ]},
    {key:'fsec',  icon:'💰', name:'Financial Secretary',           votes:[],candidates:[
      {name:'Fatima Bello',         id:'COSC/20213',bio:'Computer Science student with fintech project experience and a passion for fiscal transparency.',manifesto:'Quarterly reports, eliminate financial leakages, and establish a student emergency fund.',promises:['Quarterly reports','No leakages','Emergency fund'],emoji:'👩🏿‍💰',photo:null},
      {name:'Chidi Okonkwo',        id:'IT/21105',  bio:'Information Technology student and certified accounting software user.',manifesto:'Blockchain financial tracking, budget allocation transparency, and a student audit committee.',promises:['Blockchain tracking','Budget transparency','Audit committee'],emoji:'👨🏿‍💰',photo:null},
    ]},
    {key:'pro1',  icon:'📣', name:'P.R.O I',                       votes:[],candidates:[
      {name:'Yusuf Abubakar',       id:'SE/21009',  bio:'Software Engineering student and department tech blogger with 2,000+ online followers.',manifesto:'Revamp WUCC social media, establish a weekly department newsletter, and modernise communications.',promises:['Social media revamp','Weekly newsletter','Press releases'],emoji:'👨🏾‍🎤',photo:null},
      {name:'Grace Adaeze',         id:'COSC/20508',bio:'Computer Science student and content creator specialising in tech communication.',manifesto:'Viral WUCC campaigns, increased student participation, and a department podcast.',promises:['Viral campaigns','Student participation','Department podcast'],emoji:'👩🏽‍🎤',photo:null},
    ]},
    {key:'dwel',  icon:'🤝', name:'Director of Welfare',            votes:[],candidates:[
      {name:'Chiamaka Ibe',         id:'CYB/22401', bio:'Cyber Security student with peer counselling certification and community welfare experience.',manifesto:'Create a student hardship fund, mental wellness outreach programme, and a peer support network.',promises:['Hardship fund','Peer support network','Mental wellness outreach'],emoji:'👩🏿‍🎓',photo:null},
      {name:'Olawale Adeyemi',      id:'IT/21532',  bio:'Information Technology student and campus community organiser.',manifesto:'Establish a WUCC welfare desk, emergency loan scheme, and disability support initiative.',promises:['Welfare desk','Emergency loan scheme','Disability support'],emoji:'👨🏾‍💼',photo:null},
    ]},
    {key:'dh',    icon:'🏥', name:'Director of Health',             votes:[],candidates:[
      {name:'Chioma Eze',           id:'COSC/21412',bio:'Computer Science student and certified first-aid volunteer, passionate about health advocacy.',manifesto:'Monthly free health screenings, mental health workshops, and an ambulance emergency fund.',promises:['Free screenings','Mental health workshops','Ambulance fund'],emoji:'👩🏿‍⚕️',photo:null},
      {name:'Femi Adewale',         id:'SE/20108',  bio:'Software Engineering student and health-tech project lead at the university innovation lab.',manifesto:'A WUCC health app, free medication scheme, and better liaison with the university health centre.',promises:['WUCC health app','Free medication','Better health centre'],emoji:'👨🏿‍⚕️',photo:null},
    ]},
    {key:'dsport',icon:'⚽', name:'Director of Sports',              votes:[],candidates:[
      {name:'Chukwuemeka Nwachukwu',id:'IT/21307',  bio:'IT student and department football team captain, passionate about expanding sporting culture.',manifesto:'Expand sports facilities, run inter-programme leagues, and fund athlete development.',promises:['Sports facilities','Inter-programme leagues','Athlete scholarships'],emoji:'⚽',photo:null},
      {name:'Seun Olorunfemi',      id:'CYB/22154', bio:'Cyber Security student and multi-sport athlete representing the department.',manifesto:'A department fitness centre, annual WUCC sports festival, and support for niche sports.',promises:['Fitness centre','Annual sports festival','Fund niche sports'],emoji:'🏃🏿',photo:null},
    ]},
    {key:'dsoc',  icon:'🎉', name:'Director of Socials',             votes:[],candidates:[
      {name:'Adaeze Okafor',        id:'COSC/22201',bio:'Computer Science student and certified event management professional.',manifesto:'Monthly socials, an annual WUCC gala, and an end-of-session concert.',promises:['Monthly socials','Annual gala','End-of-session concert'],emoji:'👩🏿‍🎤',photo:null},
      {name:'Peter Nduka',          id:'SE/21478',  bio:'Software Engineering student and event coordinator for the department tech fair.',manifesto:'A WUCC social events calendar, local sponsorships, and student entertainment fund.',promises:['Events calendar','Local sponsorships','Entertainment fund'],emoji:'👨🏿‍🎨',photo:null},
    ]},
  ],
};

S.positions.forEach(function(p){p.votes=new Array(p.candidates.length).fill(0);});

var resultFilter='all', _bci=null, _dci=null;
var AVC=['#1a40c1','#e84a1a','#0a8a7a','#b07d20','#7c3aed','#0284c7','#b45309','#0d6e3a','#9d174d','#1d4ed8'];
var AVS=['\u{1F468}\u{1F3FF}\u{200D}\u{1F393}','\u{1F469}\u{1F3FF}\u{200D}\u{1F393}','\u{1F468}\u{1F3FE}\u{200D}\u{1F4BC}','\u{1F469}\u{1F3FD}\u{200D}\u{1F393}','\u{1F468}\u{1F3FF}\u{200D}\u{1F4BB}','\u{1F469}\u{1F3FE}\u{200D}\u{1F52C}','\u{1F468}\u{1F3FE}\u{200D}\u{1F4DA}','\u{1F469}\u{1F3FF}\u{200D}\u{1F4BC}','\u{1F468}\u{1F3FF}\u{200D}\u{1F4B0}','\u{1F469}\u{1F3FE}\u{200D}\u{1F4B0}'];
