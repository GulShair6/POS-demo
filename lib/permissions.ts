export type Permission =
  | "pos.use"
  | "sales.read"
  | "refund.create"
  | "catalogue.manage"
  | "inventory.adjust"
  | "customers.manage"
  | "reports.read"
  | "employees.manage"
  | "audit.read";

export const rolePermissions: Record<string, Permission[]> = {
  Owner: [
    "pos.use",
    "sales.read",
    "refund.create",
    "catalogue.manage",
    "inventory.adjust",
    "customers.manage",
    "reports.read",
    "employees.manage",
    "audit.read"
  ],
  Manager: [
    "pos.use",
    "sales.read",
    "refund.create",
    "catalogue.manage",
    "inventory.adjust",
    "customers.manage",
    "reports.read",
    "employees.manage",
    "audit.read"
  ],
  Supervisor: ["pos.use", "sales.read", "refund.create", "inventory.adjust", "customers.manage", "reports.read"],
  Cashier: ["pos.use", "sales.read", "customers.manage"],
  Inventory: ["pos.use", "catalogue.manage", "inventory.adjust", "reports.read"],
  Accountant: ["pos.use", "sales.read", "reports.read", "audit.read"],
  Auditor: ["pos.use", "sales.read", "reports.read", "audit.read"]
};

export function hasPermission(user: { role: string }, permission: Permission) {
  return rolePermissions[user.role]?.includes(permission) ?? false;
}
