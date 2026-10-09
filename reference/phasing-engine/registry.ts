import type { SKURegistry, Category } from '../types';

export const SKU_REGISTRY: SKURegistry = {
  // ===== OMNI-CHANNEL SKUS =====
  "Text": { capacity: 2, requires: [], mustPairWith: ["Keystone Communication"], weeks: 11, category: "Omni-Channel" },
  "Secure Chat": { capacity: 2, requires: ["Text"], mustPairWith: ["Co-Browse", "Lumin", "Voyix (NCR) Bking Pl Comm", "Banno", "Candescent", "Q2 Digital", "Alkami", "AI Chat", "Maholo Banking Platform Comm Integration"], weeks: 6, category: "Omni-Channel" },
  "Voice+": { capacity: 3, requires: ["Text"], mustPairWith: ["AI Voice", "Office Phones"], weeks: 12, category: "Omni-Channel" },
  "Office Phones": { capacity: 3, requires: ["Text"], mustPairWith: ["Voice+", "AI Voice"], weeks: 12, category: "Omni-Channel" },
  "Remote Video Banking": { capacity: 2, requires: ["Text"], mustPairWith: ["eNotary"], weeks: 6, category: "Omni-Channel" },
  "In-Branch Video Banking": { capacity: 2, requires: ["Text"], mustPairWith: [], weeks: 6, category: "Omni-Channel" },

  // ===== CORE BANKING SYSTEM INTEGRATIONS =====
  "Fiserv Portico Comm": { capacity: 2, requires: ["Text"], mustPairWith: ["Text"], weeks: 4, category: "Integrations", subcategory: "Core Banking System Integrations" },
  "Symitar Episys Comm Integration": { capacity: 2, requires: ["Text"], mustPairWith: ["Text"], weeks: 8, category: "Integrations", subcategory: "Core Banking System Integrations", specialFlags: ["requiresVendor"] },
  "Correlation Keystone Comm": { capacity: 2, requires: ["Text"], mustPairWith: ["Text"], weeks: 6, category: "Integrations", subcategory: "Core Banking System Integrations" },
  "CU Answers Comm": { capacity: 2, requires: ["Text"], mustPairWith: ["Text"], weeks: 6, category: "Integrations", subcategory: "Core Banking System Integrations" },
  "Visifi communication integration": { capacity: 2, requires: ["Text"], mustPairWith: ["Text"], weeks: 6, category: "Integrations", subcategory: "Core Banking System Integrations" },

  // ===== LOS (LOAN ORIGINATION SYSTEM) INTEGRATIONS =====
  "ICE (Ellie Mae) Encompass Comm Integration": { capacity: 2, requires: ["Text"], mustPairWith: [], weeks: 4, category: "Integrations", subcategory: "LOS (Loan Origination System) Integrations" },
  "MeridianLink Consumers LOS": { capacity: 1, requires: ["Text"], mustPairWith: ["MeridianLink AOS"], weeks: 4, category: "Integrations", subcategory: "LOS (Loan Origination System) Integrations", specialFlags: ["requiresVendor"] },
  "MeridianLink AOS": { capacity: 1, requires: ["Text"], mustPairWith: ["MeridianLink LOS"], weeks: 4, category: "Integrations", subcategory: "LOS (Loan Origination System) Integrations", specialFlags: ["requiresVendor"] },
  "Temenos LOS Comm": { capacity: 2, requires: ["Text"], mustPairWith: ["Temenos Collections"], weeks: 6, category: "Integrations", subcategory: "LOS (Loan Origination System) Integrations", specialFlags: ["requiresVendor"] },
  "Origence L360 Comm": { capacity: 2, requires: ["Text"], mustPairWith: [], weeks: 4, category: "Integrations", subcategory: "LOS (Loan Origination System) Integrations", specialFlags: ["requiresVendor"] },
  "Origence Comm": { capacity: 2, requires: ["Text"], mustPairWith: [], weeks: 7, category: "Integrations", subcategory: "LOS (Loan Origination System) Integrations", specialFlags: ["requiresVendor"] },
  "Sharetec Framework Pckg-PU": { capacity: 2, requires: ["Text"], mustPairWith: [], weeks: 8, category: "Integrations", subcategory: "LOS (Loan Origination System) Integrations" },
  "Sync1": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 6, category: "Integrations", subcategory: "LOS (Loan Origination System) Integrations" },

  // ===== COLLECTIONS PLATFORM INTEGRATIONS =====
  "Temenos Collections": { capacity: 2, requires: ["Text"], mustPairWith: ["Temenos LOS Comm"], weeks: 11, category: "Integrations", subcategory: "Collections Platform Integrations", specialFlags: ["requiresVendor"] },
  "Akuvo": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 7, category: "Integrations", subcategory: "Collections Platform Integrations", specialFlags: ["requiresVendor"] },
  "MeridianLink Collect Comm": { capacity: 2, requires: ["Text"], mustPairWith: [], weeks: 6, category: "Integrations", subcategory: "Collections Platform Integrations", specialFlags: ["requiresVendor"] },
  "Fiserv Loancierge Comm": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 6, category: "Integrations", subcategory: "Collections Platform Integrations", specialFlags: ["requiresVendor"] },

  // ===== ONLINE BANKING INTEGRATIONS =====
  "Mahalo": { capacity: 1, requires: ["Secure Chat"], mustPairWith: ["Secure Chat"], weeks: 8, category: "Integrations", subcategory: "Online Banking Integrations", specialFlags: ["requiresVendor"] },
  "Alkami": { capacity: 1, requires: ["Secure Chat"], mustPairWith: ["Secure Chat"], weeks: 8, category: "Integrations", subcategory: "Online Banking Integrations", specialFlags: ["requiresVendor"] },
  "Banno": { capacity: 1, requires: ["Secure Chat"], mustPairWith: ["Secure Chat"], weeks: 8, category: "Integrations", subcategory: "Online Banking Integrations", specialFlags: ["requiresVendor"] },
  "Candescent": { capacity: 0, requires: ["Secure Chat"], mustPairWith: ["Secure Chat"], weeks: 3, category: "Integrations", subcategory: "Online Banking Integrations", specialFlags: ["requiresVendor"] },
  "Q2 Digital": { capacity: 1, requires: ["Secure Chat"], mustPairWith: ["Secure Chat"], weeks: 8, category: "Integrations", subcategory: "Online Banking Integrations", specialFlags: ["requiresVendor"] },
  "Voyix (NCR) Bking Pl Comm": { capacity: 1, requires: ["Secure Chat"], mustPairWith: ["Secure Chat"], weeks: 8, category: "Integrations", subcategory: "Online Banking Integrations", specialFlags: ["requiresVendor"] },
  "Lumin": { capacity: 1, requires: ["Secure Chat"], mustPairWith: ["Secure Chat"], weeks: 8, category: "Integrations", subcategory: "Online Banking Integrations", specialFlags: ["requiresVendor"] },

  // ===== ACD (AUTOMATIC CALL DISTRIBUTION) INTEGRATIONS =====
  "Genesys ACD": { capacity: 2, requires: ["Text"], mustPairWith: [], weeks: 10, category: "Integrations", subcategory: "ACD (Automatic Call Distribution) Integrations" },
  "NICE inContact ACD": { capacity: 2, requires: ["Text"], mustPairWith: [], weeks: 10, category: "Integrations", subcategory: "ACD (Automatic Call Distribution) Integrations" },
  "NICE inContact Comm": { capacity: 2, requires: ["Text"], mustPairWith: [], weeks: 10, category: "Integrations", subcategory: "ACD (Automatic Call Distribution) Integrations" },
  "Content Guru": { capacity: 2, requires: ["Text"], mustPairWith: [], weeks: 10, category: "Integrations", subcategory: "ACD (Automatic Call Distribution) Integrations" },

  // ===== GENERAL INTERACTION FRAMEWORK =====
  "Secure Data Export": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 4, category: "Integrations", subcategory: "General Interaction Framework" },
  "Generic Contact Sync": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 4, category: "Integrations", subcategory: "General Interaction Framework" },
  "General alerts": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 5, category: "Integrations", subcategory: "General Interaction Framework" },
  "APIs Only": { capacity: 1, requires: [], mustPairWith: ["Voice+"], weeks: 3, category: "Integrations", subcategory: "General Interaction Framework" },
  "SFTP Data Extracts and Reports": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 3, category: "Integrations", subcategory: "General Interaction Framework" },

  // ===== OTHER INTEGRATIONS =====
  "Single Sign-On": { capacity: 0, requires: ["Text"], mustPairWith: [], weeks: 4, category: "Integrations", subcategory: "Other Integrations" },
  "Device Authentication - IDGO?": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 4, category: "Integrations", subcategory: "Other Integrations" },
  "MS Sharepoint Integration": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 6, category: "Integrations", subcategory: "Other Integrations" },
  "WCIX?": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 4, category: "Integrations", subcategory: "Other Integrations" },
  "DocuSign eSign Integration": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 2, category: "Integrations", subcategory: "Other Integrations" },
  "SWIVEL (SWBC Payments) Comm Integration": { capacity: 2, requires: ["Text"], mustPairWith: [], weeks: 8, category: "Integrations", subcategory: "Other Integrations" },
  "Microsoft Teams APP Integration (No SBC)": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 4, category: "Integrations", subcategory: "Other Integrations" },
  "MS Teams": { capacity: 1, requires: ["Voice+"], mustPairWith: [], weeks: 4, category: "Integrations", subcategory: "Other Integrations" },
  "Salesforce CTI Integration": { capacity: 2, requires: ["Text"], mustPairWith: [], weeks: 6, category: "Integrations", subcategory: "Other Integrations" },
  "Salesforce Mkting Cloud Comm": { capacity: 2, requires: ["Text"], mustPairWith: [], weeks: 6, category: "Integrations", subcategory: "Other Integrations" },
  "Salesforce Sales Cloud Comm": { capacity: 2, requires: ["Text"], mustPairWith: [], weeks: 6, category: "Integrations", subcategory: "Other Integrations" },
  "Messagepay": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 5, category: "Integrations", subcategory: "Other Integrations" },
  "Prisma Cmpgn Framework Pckg-PU?": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 5, category: "Integrations", subcategory: "Other Integrations" },
  "WithClutch-Framework Pckg-PU": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 4, category: "Integrations", subcategory: "Other Integrations" },
  "CUProdigy Framework Pckg-PU?": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 5, category: "Integrations", subcategory: "Other Integrations" },

  // ===== AI MODULES =====
  "AI Voice - Authenticated": { capacity: 3, requires: ["Text", "AI Automation - Core Integration"], mustPairWith: ["Voice+", "Office Phones"], weeks: 12, category: "AI Modules" },
  "AI Voice - Unauthenticated": { capacity: 2, requires: ["Text"], mustPairWith: ["Voice+", "Office Phones"], weeks: 6, category: "AI Modules" },
  "AI Assistant": { capacity: 2, requires: ["Text", "AI Automation - Core Integration"], mustPairWith: [], weeks: 12, category: "AI Modules" },
  "AI Chat": { capacity: 2, requires: ["Text"], mustPairWith: ["Secure Chat", "AI Voice"], weeks: 6, category: "AI Modules" },
  "Conversational Intelligence": { capacity: 2, requires: ["Text", "Secure Chat", "Voice+"], mustPairWith: [], weeks: 4, category: "AI Modules" },
  "AI Automation - Core Integration": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 5, category: "AI Modules" },

  // ===== ADD-ON MODULES: SCHEDULING & LOBBY =====
  "Appointment Management": { capacity: 2, requires: ["Text"], mustPairWith: ["Lobby Management"], weeks: 8, category: "Add-on Modules", subcategory: "Scheduling & Lobby" },
  "Lobby Management": { capacity: 2, requires: ["Text"], mustPairWith: ["Appointment Management"], weeks: 8, category: "Add-on Modules", subcategory: "Scheduling & Lobby" },

  // ===== ADD-ON MODULES: SIGNATURE & VERIFICATION =====
  "ESign": { capacity: 1, requires: ["Text"], mustPairWith: ["Remote Video Banking"], weeks: 5, category: "Add-on Modules", subcategory: "Signature & Verification" },
  "IMM Esign": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 5, category: "Add-on Modules", subcategory: "Signature & Verification" },
  "Remote Check Deposit?": { capacity: 0, requires: ["Text"], mustPairWith: [], weeks: 5, category: "Add-on Modules", subcategory: "Signature & Verification" },
  "eNotary": { capacity: 2, requires: ["Remote Video Banking"], mustPairWith: ["Remote Video Banking"], weeks: 5, category: "Add-on Modules", subcategory: "Signature & Verification" },
  "ID Verification": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 4, category: "Add-on Modules", subcategory: "Signature & Verification" },

  // ===== ADD-ON MODULES: PAYMENTS =====
  "Eltropy Payments - SFTP": { capacity: 3, requires: ["Text"], mustPairWith: [], weeks: 12, category: "Add-on Modules", subcategory: "Payments" },
  "Eltropy Payments - Kinective": { capacity: 3, requires: ["Text", "Payments Automation - Core Integration"], mustPairWith: [], weeks: 12, category: "Add-on Modules", subcategory: "Payments" },
  "Payments Automation - Core Integration": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 5, category: "Add-on Modules", subcategory: "Payments" },

  // ===== ADD-ON MODULES: COMMUNICATION ADD-ONS =====
  "FAX": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 7, category: "Add-on Modules", subcategory: "Communication Add-ons" },
  "Text to Talk": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 3, category: "Add-on Modules", subcategory: "Communication Add-ons" },
  "Screen Recording": { capacity: 0, requires: ["Text"], mustPairWith: ["Voice+"], weeks: 7, category: "Add-on Modules", subcategory: "Communication Add-ons" },
  "Co-Browse": { capacity: 0, requires: ["Secure Chat"], mustPairWith: ["Secure Chat"], weeks: 2, category: "Add-on Modules", subcategory: "Communication Add-ons" },
  "Branded Calling": { capacity: 1, requires: ["Text", "Voice+"], mustPairWith: [], weeks: 4, category: "Add-on Modules", subcategory: "Communication Add-ons" },
  "Branded Texting": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 6, category: "Add-on Modules", subcategory: "Communication Add-ons" },
  "Reputation Management": { capacity: 1, requires: ["Text"], mustPairWith: [], weeks: 2, category: "Add-on Modules", subcategory: "Communication Add-ons" },
};

export const CATEGORIES: Category[] = [
  { key: "Omni-Channel", color: "#4B6BFB" },
  { key: "Integrations", color: "#10B981" },
  { key: "AI Modules", color: "#7C3AED" },
  { key: "Add-on Modules", color: "#F59E0B" },
];

export const PACKAGES: any[] = [];

export const PHASE_COLORS = ['#4B6BFB', '#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'];
export const PHASE_LABELS = ['Foundation', 'Core', 'Advanced', 'Expansion', 'Optional', 'Phase 6', 'Phase 7', 'Phase 8'];

export const PHASE_CAPACITY = 9;
export const CONCURRENT_CAPACITY_THRESHOLD = 4;
export const WEEKS_SHOWN = 60;
export const WW = 44;
