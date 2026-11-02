export const MENU_GROUPS = [
  {
    label: "Operations",
    items: [
      ["Queue Control", "/lyn-co/admin/queue"],
      ["TV Display", "/lyn-co/admin/tv"],
      ["Device Monitoring", "/lyn-co/admin/devices"],
      ["Analytics & Forecasting", "/lyn-co/admin/analytics"],
    ],
  },
  {
    label: "Management",
    items: [
      ["Staff Management", "/lyn-co/admin/staff"],
      ["Service Catalog", "/lyn-co/admin/module/service-catalog"],
      ["VIP & Customer Tags", "/lyn-co/admin/module/customer-tagging"],
      ["Promotions", "/lyn-co/admin/module/promotions-events"],
      ["POS & Transactions", "/lyn-co/admin/module/pos-transactions"],
      ["Reports", "/lyn-co/admin/module/reports"],
      ["Backup & Restore", "/lyn-co/admin/module/backup-restore"],
      ["Audit Logs", "/lyn-co/admin/module/audit-logs"],
    ],
  },
] as const;
