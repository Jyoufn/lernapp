// Alle Aktien, die im Planspiel Börse handelbar sind (Auswahl nach den Indizes des Spiels): DAX, MDAX, SDAX, TecDAX, EuroStoxx 50,
// Dow Jones, Nasdaq 100, FTSE MIB, ATX, LuxX, Global Challenges Index und „Selection Europe“ (große Werte aus dem Stoxx Europe 600).
// Fonds (Deka) und Anleihen werden nicht im Chart gescannt. Je Wert: Yahoo-Kürzel, Name, Branche. Indexwechsel kommen vor – ein Wert,
// der nicht mehr existiert, liefert einfach keine Kurse und wird übersprungen.
// Branchen: TECH Software & Internet · SEMI Halbleiter · DEF Rüstung & Luftfahrt · AUTO Autos · BANK Banken & Börsen · INS Versicherungen ·
// PHARMA Pharma & Gesundheit · CHEM Chemie · CONS Konsum · ENERGY Öl & Gas · UTIL Energie & Versorger · IND Industrie · TEL Telekom ·
// REAL Immobilien · TRAVEL Reise & Verkehr · MAT Rohstoffe & Stahl · MEDIA Medien
const SECTOR_NAME = {
  TECH: 'Software & Internet', SEMI: 'Halbleiter', DEF: 'Rüstung & Luftfahrt', AUTO: 'Autos', BANK: 'Banken & Börsen', INS: 'Versicherungen',
  PHARMA: 'Pharma & Gesundheit', CHEM: 'Chemie', CONS: 'Konsum', ENERGY: 'Öl & Gas', UTIL: 'Energie & Versorger', IND: 'Industrie', TEL: 'Telekom',
  REAL: 'Immobilien', TRAVEL: 'Reise & Verkehr', MAT: 'Rohstoffe & Stahl', MEDIA: 'Medien',
};
// [Kürzel, Name, Branche]
const INDICES = {
  DAX: [
    ['ADS.DE', 'adidas', 'CONS'], ['AIR.DE', 'Airbus', 'DEF'], ['ALV.DE', 'Allianz', 'INS'], ['BAS.DE', 'BASF', 'CHEM'], ['BAYN.DE', 'Bayer', 'PHARMA'],
    ['BEI.DE', 'Beiersdorf', 'CONS'], ['BMW.DE', 'BMW', 'AUTO'], ['BNR.DE', 'Brenntag', 'CHEM'], ['CBK.DE', 'Commerzbank', 'BANK'], ['CON.DE', 'Continental', 'AUTO'],
    ['DTG.DE', 'Daimler Truck', 'AUTO'], ['DBK.DE', 'Deutsche Bank', 'BANK'], ['DB1.DE', 'Deutsche Börse', 'BANK'], ['DHL.DE', 'DHL Group', 'TRAVEL'],
    ['DTE.DE', 'Deutsche Telekom', 'TEL'], ['EOAN.DE', 'E.ON', 'UTIL'], ['FRE.DE', 'Fresenius', 'PHARMA'], ['G1A.DE', 'GEA Group', 'IND'],
    ['HNR1.DE', 'Hannover Rück', 'INS'], ['HEI.DE', 'Heidelberg Materials', 'MAT'], ['HEN3.DE', 'Henkel', 'CONS'], ['IFX.DE', 'Infineon', 'SEMI'],
    ['MBG.DE', 'Mercedes-Benz', 'AUTO'], ['MRK.DE', 'Merck KGaA', 'PHARMA'], ['MTX.DE', 'MTU Aero Engines', 'DEF'], ['MUV2.DE', 'Münchener Rück', 'INS'],
    ['P911.DE', 'Porsche AG', 'AUTO'], ['PAH3.DE', 'Porsche SE', 'AUTO'], ['QIA.DE', 'Qiagen', 'PHARMA'], ['RHM.DE', 'Rheinmetall', 'DEF'],
    ['RWE.DE', 'RWE', 'UTIL'], ['SAP.DE', 'SAP', 'TECH'], ['SRT3.DE', 'Sartorius', 'PHARMA'], ['SIE.DE', 'Siemens', 'IND'], ['ENR.DE', 'Siemens Energy', 'UTIL'],
    ['SHL.DE', 'Siemens Healthineers', 'PHARMA'], ['SY1.DE', 'Symrise', 'CHEM'], ['VOW3.DE', 'Volkswagen', 'AUTO'], ['VNA.DE', 'Vonovia', 'REAL'],
    ['ZAL.DE', 'Zalando', 'CONS'], ['G24.DE', 'Scout24', 'TECH'],
  ],
  MDAX: [
    ['AIXA.DE', 'Aixtron', 'SEMI'], ['AT1.DE', 'Aroundtown', 'REAL'], ['NDA.DE', 'Aurubis', 'MAT'], ['AG1.DE', 'Auto1', 'CONS'], ['BC8.DE', 'Bechtle', 'TECH'],
    ['EVD.DE', 'CTS Eventim', 'MEDIA'], ['DHER.DE', 'Delivery Hero', 'TECH'], ['DWNI.DE', 'Deutsche Wohnen', 'REAL'], ['EVK.DE', 'Evonik', 'CHEM'],
    ['EVT.DE', 'Evotec', 'PHARMA'], ['FIE.DE', 'Fielmann', 'CONS'], ['FRA.DE', 'Fraport', 'TRAVEL'], ['FNTN.DE', 'freenet', 'TEL'], ['FPE3.DE', 'Fuchs', 'CHEM'],
    ['GXI.DE', 'Gerresheimer', 'PHARMA'], ['HAG.DE', 'Hensoldt', 'DEF'], ['HOT.DE', 'Hochtief', 'IND'], ['BOSS.DE', 'Hugo Boss', 'CONS'], ['IOS.DE', 'Ionos', 'TECH'],
    ['JUN3.DE', 'Jungheinrich', 'IND'], ['SDF.DE', 'K+S', 'CHEM'], ['KGX.DE', 'Kion', 'IND'], ['KBX.DE', 'Knorr-Bremse', 'IND'], ['KRN.DE', 'Krones', 'IND'],
    ['LXS.DE', 'Lanxess', 'CHEM'], ['LEG.DE', 'LEG Immobilien', 'REAL'], ['LHA.DE', 'Lufthansa', 'TRAVEL'], ['NEM.DE', 'Nemetschek', 'TECH'], ['NDX1.DE', 'Nordex', 'UTIL'],
    ['PUM.DE', 'Puma', 'CONS'], ['RAA.DE', 'Rational', 'IND'], ['RDC.DE', 'Redcare Pharmacy', 'PHARMA'], ['R3NK.DE', 'Renk', 'DEF'], ['RRTL.DE', 'RTL Group', 'MEDIA'],
    ['SHA0.DE', 'Schaeffler', 'AUTO'], ['WAF.DE', 'Siltronic', 'SEMI'], ['SIX2.DE', 'Sixt', 'TRAVEL'], ['SAX.DE', 'Ströer', 'MEDIA'], ['TLX.DE', 'Talanx', 'INS'],
    ['TMV.DE', 'TeamViewer', 'TECH'], ['TKA.DE', 'thyssenkrupp', 'MAT'], ['TKMS.DE', 'TKMS', 'DEF'], ['8TRA.DE', 'Traton', 'AUTO'], ['TUI1.DE', 'TUI', 'TRAVEL'],
    ['UTDI.DE', 'United Internet', 'TEL'], ['WCH.DE', 'Wacker Chemie', 'CHEM'], ['TAG.DE', 'TAG Immobilien', 'REAL'], ['AFX.DE', 'Carl Zeiss Meditec', 'PHARMA'],
    ['DUE.DE', 'Dürr', 'IND'], ['HFG.DE', 'HelloFresh', 'CONS'],
  ],
  SDAX: [
    ['1U1.DE', '1&1', 'TEL'], ['ADN1.DE', 'adesso', 'TECH'], ['AAD.DE', 'Amadeus Fire', 'IND'], ['AOF.DE', 'Atoss Software', 'TECH'], ['BYW6.DE', 'BayWa', 'CONS'],
    ['GBF.DE', 'Bilfinger', 'IND'], ['BIO3.DE', 'Biotest', 'PHARMA'], ['COK.DE', 'Cancom', 'TECH'], ['CWC.DE', 'Cewe', 'CONS'], ['DBAN.DE', 'Deutsche Beteiligungs AG', 'BANK'],
    ['PBB.DE', 'Deutsche Pfandbriefbank', 'BANK'], ['DEZ.DE', 'Deutz', 'IND'], ['DMP.DE', 'Dermapharm', 'PHARMA'], ['DRW3.DE', 'Drägerwerk', 'PHARMA'],
    ['EUZ.DE', 'Eckert & Ziegler', 'PHARMA'], ['ELG.DE', 'Elmos Semiconductor', 'SEMI'], ['EKT.DE', 'Energiekontor', 'UTIL'], ['FTK.DE', 'flatexDEGIRO', 'BANK'],
    ['FYB.DE', 'Formycon', 'PHARMA'], ['VH2.DE', 'Friedrich Vorwerk', 'IND'], ['GFT.DE', 'GFT Technologies', 'TECH'], ['GLJ.DE', 'Grenke', 'BANK'],
    ['HHFA.DE', 'HHLA', 'TRAVEL'], ['HDD.DE', 'Heidelberger Druck', 'IND'], ['HBH.DE', 'Hornbach', 'CONS'], ['HYQ.DE', 'Hypoport', 'BANK'], ['INH.DE', 'Indus', 'IND'],
    ['JEN.DE', 'Jenoptik', 'SEMI'], ['KCO.DE', 'Klöckner & Co', 'MAT'], ['SANT.DE', 'Kontron', 'TECH'], ['KSB3.DE', 'KSB', 'IND'], ['KWS.DE', 'KWS Saat', 'CHEM'],
    ['LPK.DE', 'LPKF', 'SEMI'], ['MUX.DE', 'Mutares', 'BANK'], ['NA9.DE', 'Nagarro', 'TECH'], ['NOEJ.DE', 'Norma Group', 'AUTO'], ['OHB.DE', 'OHB', 'DEF'],
    ['PAT.DE', 'Patrizia', 'REAL'], ['PNE3.DE', 'PNE', 'UTIL'], ['PSM.DE', 'ProSiebenSat.1', 'MEDIA'], ['TPE.DE', 'PVA TePla', 'SEMI'], ['SFQ.DE', 'SAF-Holland', 'AUTO'],
    ['SZG.DE', 'Salzgitter', 'MAT'], ['SGL.DE', 'SGL Carbon', 'CHEM'], ['S92.DE', 'SMA Solar', 'UTIL'], ['STM.DE', 'Stabilus', 'IND'], ['SBS.DE', 'Stratec', 'PHARMA'],
    ['SZU.DE', 'Südzucker', 'CONS'], ['SMHN.DE', 'Süss MicroTec', 'SEMI'], ['TTK.DE', 'Takkt', 'CONS'], ['VBK.DE', 'Verbio', 'UTIL'], ['VOS.DE', 'Vossloh', 'IND'],
    ['WAC.DE', 'Wacker Neuson', 'IND'], ['WUW.DE', 'Wüstenrot & Württembergische', 'INS'], ['2GB.DE', '2G Energy', 'UTIL'], ['MBB.DE', 'MBB', 'IND'],
    ['DEQ.DE', 'Deutsche EuroShop', 'REAL'],
  ],
  TecDAX: [
    ['AFX.DE', 'Carl Zeiss Meditec', 'PHARMA'], ['NDX1.DE', 'Nordex', 'UTIL'], ['S92.DE', 'SMA Solar', 'UTIL'], ['SMHN.DE', 'Süss MicroTec', 'SEMI'],
  ],
  'EuroStoxx 50': [
    ['ADYEN.AS', 'Adyen', 'BANK'], ['AD.AS', 'Ahold Delhaize', 'CONS'], ['AI.PA', 'Air Liquide', 'CHEM'], ['ABI.BR', 'AB InBev', 'CONS'], ['ARGX.BR', 'argenx', 'PHARMA'],
    ['ASML.AS', 'ASML', 'SEMI'], ['CS.PA', 'AXA', 'INS'], ['BBVA.MC', 'BBVA', 'BANK'], ['SAN.MC', 'Banco Santander', 'BANK'], ['BNP.PA', 'BNP Paribas', 'BANK'],
    ['BN.PA', 'Danone', 'CONS'], ['ENEL.MI', 'Enel', 'UTIL'], ['ENI.MI', 'Eni', 'ENERGY'], ['EL.PA', 'EssilorLuxottica', 'CONS'], ['RACE.MI', 'Ferrari', 'AUTO'],
    ['IBE.MC', 'Iberdrola', 'UTIL'], ['ITX.MC', 'Inditex', 'CONS'], ['INGA.AS', 'ING', 'BANK'], ['ISP.MI', 'Intesa Sanpaolo', 'BANK'], ['OR.PA', "L'Oréal", 'CONS'],
    ['MC.PA', 'LVMH', 'CONS'], ['NDA-FI.HE', 'Nordea', 'BANK'], ['PRX.AS', 'Prosus', 'TECH'], ['RMS.PA', 'Hermès', 'CONS'], ['SAF.PA', 'Safran', 'DEF'],
    ['SAN.PA', 'Sanofi', 'PHARMA'], ['SU.PA', 'Schneider Electric', 'IND'], ['SGO.PA', 'Saint-Gobain', 'IND'], ['STLAM.MI', 'Stellantis', 'AUTO'],
    ['TTE.PA', 'TotalEnergies', 'ENERGY'], ['UCG.MI', 'UniCredit', 'BANK'], ['DG.PA', 'Vinci', 'IND'], ['WKL.AS', 'Wolters Kluwer', 'MEDIA'], ['ENGI.PA', 'Engie', 'UTIL'],
    ['KNEBV.HE', 'Kone', 'IND'], ['NOKIA.HE', 'Nokia', 'TEL'], ['KER.PA', 'Kering', 'CONS'], ['ORA.PA', 'Orange', 'TEL'],
  ],
  'Dow Jones': [
    ['AAPL', 'Apple', 'TECH'], ['AMGN', 'Amgen', 'PHARMA'], ['AMZN', 'Amazon', 'TECH'], ['AXP', 'American Express', 'BANK'], ['BA', 'Boeing', 'DEF'],
    ['CAT', 'Caterpillar', 'IND'], ['CRM', 'Salesforce', 'TECH'], ['CSCO', 'Cisco', 'TECH'], ['CVX', 'Chevron', 'ENERGY'], ['DIS', 'Disney', 'MEDIA'],
    ['GS', 'Goldman Sachs', 'BANK'], ['HD', 'Home Depot', 'CONS'], ['HON', 'Honeywell', 'IND'], ['IBM', 'IBM', 'TECH'], ['JNJ', 'Johnson & Johnson', 'PHARMA'],
    ['JPM', 'JPMorgan', 'BANK'], ['KO', 'Coca-Cola', 'CONS'], ['MCD', "McDonald's", 'CONS'], ['MMM', '3M', 'IND'], ['MRK', 'Merck & Co', 'PHARMA'],
    ['MSFT', 'Microsoft', 'TECH'], ['NKE', 'Nike', 'CONS'], ['NVDA', 'Nvidia', 'SEMI'], ['PG', 'Procter & Gamble', 'CONS'], ['SHW', 'Sherwin-Williams', 'CHEM'],
    ['TRV', 'Travelers', 'INS'], ['UNH', 'UnitedHealth', 'PHARMA'], ['V', 'Visa', 'BANK'], ['VZ', 'Verizon', 'TEL'], ['WMT', 'Walmart', 'CONS'],
  ],
  'Nasdaq 100': [
    ['ABNB', 'Airbnb', 'TRAVEL'], ['ADBE', 'Adobe', 'TECH'], ['ADI', 'Analog Devices', 'SEMI'], ['ADP', 'ADP', 'TECH'], ['ADSK', 'Autodesk', 'TECH'], ['AEP', 'American Electric Power', 'UTIL'],
    ['AMAT', 'Applied Materials', 'SEMI'], ['AMD', 'AMD', 'SEMI'], ['APP', 'AppLovin', 'TECH'], ['ARM', 'Arm', 'SEMI'], ['AVGO', 'Broadcom', 'SEMI'], ['AXON', 'Axon', 'DEF'],
    ['AZN', 'AstraZeneca', 'PHARMA'], ['BIIB', 'Biogen', 'PHARMA'], ['BKNG', 'Booking', 'TRAVEL'], ['BKR', 'Baker Hughes', 'ENERGY'], ['CCEP', 'Coca-Cola Europacific', 'CONS'],
    ['CDNS', 'Cadence', 'TECH'], ['CDW', 'CDW', 'TECH'], ['CEG', 'Constellation Energy', 'UTIL'], ['CHTR', 'Charter', 'TEL'], ['CMCSA', 'Comcast', 'MEDIA'],
    ['COST', 'Costco', 'CONS'], ['CPRT', 'Copart', 'IND'], ['CRWD', 'CrowdStrike', 'TECH'], ['CSGP', 'CoStar', 'TECH'], ['CSX', 'CSX', 'TRAVEL'], ['CTAS', 'Cintas', 'IND'],
    ['CTSH', 'Cognizant', 'TECH'], ['DASH', 'DoorDash', 'TECH'], ['DDOG', 'Datadog', 'TECH'], ['DXCM', 'Dexcom', 'PHARMA'], ['EA', 'Electronic Arts', 'MEDIA'],
    ['EXC', 'Exelon', 'UTIL'], ['FANG', 'Diamondback', 'ENERGY'], ['FAST', 'Fastenal', 'IND'], ['FTNT', 'Fortinet', 'TECH'], ['GEHC', 'GE HealthCare', 'PHARMA'],
    ['GFS', 'GlobalFoundries', 'SEMI'], ['GILD', 'Gilead', 'PHARMA'], ['GOOGL', 'Alphabet (Google)', 'TECH'], ['IDXX', 'Idexx', 'PHARMA'], ['INTC', 'Intel', 'SEMI'],
    ['INTU', 'Intuit', 'TECH'], ['ISRG', 'Intuitive Surgical', 'PHARMA'], ['KDP', 'Keurig Dr Pepper', 'CONS'], ['KHC', 'Kraft Heinz', 'CONS'], ['KLAC', 'KLA', 'SEMI'],
    ['LIN', 'Linde', 'CHEM'], ['LRCX', 'Lam Research', 'SEMI'], ['LULU', 'Lululemon', 'CONS'], ['MAR', 'Marriott', 'TRAVEL'], ['MCHP', 'Microchip', 'SEMI'],
    ['MDB', 'MongoDB', 'TECH'], ['MDLZ', 'Mondelez', 'CONS'], ['MELI', 'MercadoLibre', 'TECH'], ['META', 'Meta (Facebook)', 'TECH'], ['MNST', 'Monster Beverage', 'CONS'],
    ['MRVL', 'Marvell', 'SEMI'], ['MSTR', 'Strategy (MicroStrategy)', 'TECH'], ['MU', 'Micron', 'SEMI'], ['NFLX', 'Netflix', 'MEDIA'], ['NXPI', 'NXP', 'SEMI'],
    ['ODFL', 'Old Dominion', 'TRAVEL'], ['ON', 'ON Semiconductor', 'SEMI'], ['ORLY', "O'Reilly", 'CONS'], ['PANW', 'Palo Alto Networks', 'TECH'], ['PAYX', 'Paychex', 'TECH'],
    ['PCAR', 'Paccar', 'AUTO'], ['PDD', 'PDD (Temu)', 'CONS'], ['PEP', 'PepsiCo', 'CONS'], ['PLTR', 'Palantir', 'TECH'], ['PYPL', 'PayPal', 'BANK'], ['QCOM', 'Qualcomm', 'SEMI'],
    ['REGN', 'Regeneron', 'PHARMA'], ['ROP', 'Roper', 'TECH'], ['ROST', 'Ross Stores', 'CONS'], ['SBUX', 'Starbucks', 'CONS'], ['SHOP', 'Shopify', 'TECH'],
    ['SNPS', 'Synopsys', 'TECH'], ['TEAM', 'Atlassian', 'TECH'], ['TMUS', 'T-Mobile US', 'TEL'], ['TRI', 'Thomson Reuters', 'MEDIA'], ['TSLA', 'Tesla', 'AUTO'],
    ['TTD', 'Trade Desk', 'TECH'], ['TTWO', 'Take-Two', 'MEDIA'], ['TXN', 'Texas Instruments', 'SEMI'], ['VRSK', 'Verisk', 'TECH'], ['VRTX', 'Vertex', 'PHARMA'],
    ['WBD', 'Warner Bros. Discovery', 'MEDIA'], ['WDAY', 'Workday', 'TECH'], ['XEL', 'Xcel Energy', 'UTIL'], ['ZS', 'Zscaler', 'TECH'], ['AMZN', 'Amazon', 'TECH'],
    ['AAPL', 'Apple', 'TECH'], ['MSFT', 'Microsoft', 'TECH'], ['NVDA', 'Nvidia', 'SEMI'], ['CSCO', 'Cisco', 'TECH'], ['AMGN', 'Amgen', 'PHARMA'], ['HON', 'Honeywell', 'IND'],
  ],
  'FTSE MIB': [
    ['A2A.MI', 'A2A', 'UTIL'], ['AMP.MI', 'Amplifon', 'PHARMA'], ['AZM.MI', 'Azimut', 'BANK'], ['BAMI.MI', 'Banco BPM', 'BANK'], ['BMED.MI', 'Banca Mediolanum', 'BANK'],
    ['BMPS.MI', 'Monte dei Paschi', 'BANK'], ['BPE.MI', 'BPER Banca', 'BANK'], ['BZU.MI', 'Buzzi', 'MAT'], ['CPR.MI', 'Campari', 'CONS'], ['DIA.MI', 'DiaSorin', 'PHARMA'],
    ['ERG.MI', 'ERG', 'UTIL'], ['FBK.MI', 'FinecoBank', 'BANK'], ['G.MI', 'Generali', 'INS'], ['HER.MI', 'Hera', 'UTIL'], ['IG.MI', 'Italgas', 'UTIL'], ['INW.MI', 'Inwit', 'TEL'],
    ['IP.MI', 'Interpump', 'IND'], ['IVG.MI', 'Iveco', 'AUTO'], ['LDO.MI', 'Leonardo', 'DEF'], ['MB.MI', 'Mediobanca', 'BANK'], ['MONC.MI', 'Moncler', 'CONS'],
    ['NEXI.MI', 'Nexi', 'BANK'], ['PIRC.MI', 'Pirelli', 'AUTO'], ['PRY.MI', 'Prysmian', 'IND'], ['PST.MI', 'Poste Italiane', 'BANK'], ['REC.MI', 'Recordati', 'PHARMA'],
    ['SPM.MI', 'Saipem', 'ENERGY'], ['SRG.MI', 'Snam', 'UTIL'], ['STMMI.MI', 'STMicroelectronics', 'SEMI'], ['TEN.MI', 'Tenaris', 'ENERGY'], ['TIT.MI', 'Telecom Italia', 'TEL'],
    ['TRN.MI', 'Terna', 'UTIL'], ['UNI.MI', 'Unipol', 'INS'], ['AVIO.MI', 'Avio', 'DEF'], ['FCT.MI', 'Fincantieri', 'DEF'],
  ],
  ATX: [
    ['ANDR.VI', 'Andritz', 'IND'], ['BG.VI', 'BAWAG', 'BANK'], ['CAI.VI', 'CA Immo', 'REAL'], ['DOC.VI', 'DO & CO', 'TRAVEL'], ['EBS.VI', 'Erste Group', 'BANK'],
    ['EVN.VI', 'EVN', 'UTIL'], ['LNZ.VI', 'Lenzing', 'CHEM'], ['OMV.VI', 'OMV', 'ENERGY'], ['POST.VI', 'Österreichische Post', 'TRAVEL'], ['RBI.VI', 'Raiffeisen Bank', 'BANK'],
    ['SBO.VI', 'Schoeller-Bleckmann', 'ENERGY'], ['STR.VI', 'Strabag', 'IND'], ['TKA.VI', 'Telekom Austria', 'TEL'], ['UQA.VI', 'Uniqa', 'INS'], ['VER.VI', 'Verbund', 'UTIL'],
    ['VIG.VI', 'Vienna Insurance Group', 'INS'], ['VOE.VI', 'voestalpine', 'MAT'], ['WIE.VI', 'Wienerberger', 'MAT'], ['ATS.VI', 'AT&S', 'SEMI'], ['PAL.VI', 'Palfinger', 'IND'],
  ],
  LuxX: [
    ['MT.AS', 'ArcelorMittal', 'MAT'], ['APAM.AS', 'Aperam', 'MAT'], ['SESG.PA', 'SES', 'MEDIA'], ['ERF.PA', 'Eurofins', 'PHARMA'], ['RRTL.DE', 'RTL Group', 'MEDIA'],
  ],
  'Global Challenges': [
    ['VWS.CO', 'Vestas', 'UTIL'], ['ORSTED.CO', 'Ørsted', 'UTIL'], ['NOVO-B.CO', 'Novo Nordisk', 'PHARMA'], ['NSIS-B.CO', 'Novonesis', 'CHEM'], ['DSY.PA', 'Dassault Systèmes', 'TECH'],
    ['SIKA.SW', 'Sika', 'MAT'], ['GIVN.SW', 'Givaudan', 'CHEM'], ['UMI.BR', 'Umicore', 'CHEM'], ['TOM.OL', 'Tomra', 'IND'], ['XYL', 'Xylem', 'IND'], ['ECL', 'Ecolab', 'CHEM'],
    ['AWK', 'American Water', 'UTIL'], ['DHR', 'Danaher', 'PHARMA'], ['TMO', 'Thermo Fisher', 'PHARMA'], ['FSLR', 'First Solar', 'UTIL'], ['ENPH', 'Enphase', 'UTIL'],
    ['KGX.DE', 'Kion', 'IND'], ['BEI.DE', 'Beiersdorf', 'CONS'], ['SU.PA', 'Schneider Electric', 'IND'], ['KRX.IR', 'Kingspan', 'MAT'], ['ALFA.ST', 'Alfa Laval', 'IND'],
  ],
  'Selection Europe': [
    ['NESN.SW', 'Nestlé', 'CONS'], ['ROG.SW', 'Roche', 'PHARMA'], ['NOVN.SW', 'Novartis', 'PHARMA'], ['UBSG.SW', 'UBS', 'BANK'], ['ABBN.SW', 'ABB', 'IND'],
    ['ZURN.SW', 'Zurich Insurance', 'INS'], ['CFR.SW', 'Richemont', 'CONS'], ['HOLN.SW', 'Holcim', 'MAT'], ['LONN.SW', 'Lonza', 'PHARMA'], ['SHEL.L', 'Shell', 'ENERGY'],
    ['AZN.L', 'AstraZeneca', 'PHARMA'], ['HSBA.L', 'HSBC', 'BANK'], ['ULVR.L', 'Unilever', 'CONS'], ['BP.L', 'BP', 'ENERGY'], ['GSK.L', 'GSK', 'PHARMA'], ['RIO.L', 'Rio Tinto', 'MAT'],
    ['REL.L', 'RELX', 'MEDIA'], ['LSEG.L', 'London Stock Exchange', 'BANK'], ['DGE.L', 'Diageo', 'CONS'], ['RR.L', 'Rolls-Royce', 'DEF'], ['BA.L', 'BAE Systems', 'DEF'],
    ['NG.L', 'National Grid', 'UTIL'], ['LLOY.L', 'Lloyds', 'BANK'], ['BARC.L', 'Barclays', 'BANK'], ['VOD.L', 'Vodafone', 'TEL'], ['GLEN.L', 'Glencore', 'MAT'],
    ['EQNR.OL', 'Equinor', 'ENERGY'], ['DSV.CO', 'DSV', 'TRAVEL'], ['MAERSK-B.CO', 'Maersk', 'TRAVEL'], ['ATCO-A.ST', 'Atlas Copco', 'IND'], ['VOLV-B.ST', 'Volvo', 'AUTO'],
    ['INVE-B.ST', 'Investor AB', 'BANK'], ['ERIC-B.ST', 'Ericsson', 'TEL'], ['HM-B.ST', 'H&M', 'CONS'], ['SAAB-B.ST', 'Saab', 'DEF'], ['KOG.OL', 'Kongsberg', 'DEF'],
    ['RNO.PA', 'Renault', 'AUTO'], ['HO.PA', 'Thales', 'DEF'], ['AM.PA', 'Dassault Aviation', 'DEF'], ['CAP.PA', 'Capgemini', 'TECH'], ['ML.PA', 'Michelin', 'AUTO'],
    ['PHIA.AS', 'Philips', 'PHARMA'], ['HEIA.AS', 'Heineken', 'CONS'], ['UCB.BR', 'UCB', 'PHARMA'], ['REP.MC', 'Repsol', 'ENERGY'], ['TEF.MC', 'Telefónica', 'TEL'],
    ['AENA.MC', 'Aena', 'TRAVEL'], ['CABK.MC', 'CaixaBank', 'BANK'],
  ],
};
// TecDAX: die übrigen Werte stecken schon in DAX/MDAX/SDAX – hier nur die Zuordnung zum Index
const TECDAX_ALSO = ['SAP.DE', 'IFX.DE', 'DTE.DE', 'QIA.DE', 'SRT3.DE', 'AIXA.DE', 'BC8.DE', 'NEM.DE', 'EVT.DE', 'TMV.DE', 'UTDI.DE', '1U1.DE', 'FNTN.DE', 'JEN.DE',
  'NA9.DE', 'ELG.DE', 'AOF.DE', 'COK.DE', 'DRW3.DE', 'EUZ.DE', 'HYQ.DE', 'IOS.DE', 'VBK.DE', 'ADN1.DE', 'GFT.DE', 'PNE3.DE', 'FYB.DE', 'SANT.DE', 'TPE.DE', 'WAF.DE'];

// zusammenführen: jeder Wert einmal, mit allen Indizes, in denen er steckt
const ALL = new Map();
for (const [idx, list] of Object.entries(INDICES)) {
  for (const [symbol, name, sec] of list) {
    const e = ALL.get(symbol) || { symbol, name, sector: SECTOR_NAME[sec] || 'Sonstige', indices: [] };
    if (!e.indices.includes(idx)) e.indices.push(idx);
    ALL.set(symbol, e);
  }
}
TECDAX_ALSO.forEach((s) => { const e = ALL.get(s); if (e && !e.indices.includes('TecDAX')) e.indices.push('TecDAX'); });
const LIST = [...ALL.values()];

// Haupt-Index eines Werts für die Anzeige (DAX vor MDAX vor SDAX …; TecDAX nur, wenn er sonst in keinem deutschen Index steckt)
const ORDER = ['DAX', 'MDAX', 'SDAX', 'TecDAX', 'EuroStoxx 50', 'Dow Jones', 'Nasdaq 100', 'FTSE MIB', 'ATX', 'LuxX', 'Global Challenges', 'Selection Europe'];
const indexOf = (symbol) => { const e = ALL.get(symbol); if (!e) return ''; return ORDER.find((i) => e.indices.includes(i)) || e.indices[0] || ''; };

module.exports = { LIST, INDICES, SECTOR_NAME, bySymbol: ALL, indexOf };
