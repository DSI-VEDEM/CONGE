import pkg from "@prisma/client";
const { PrismaClient, DepartmentType, EmployeeRole, EmployeeStatus, ServiceType } = pkg;
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();
const DEFAULT_SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

const departments = [
  {
    type: DepartmentType.DAF,
    name: "Direction Administrative et Financière",
    description: "Supervise la comptabilité, la trésorerie et les audits internes.",
  },
  {
    type: DepartmentType.DSI,
    name: "Direction du Service d'Informatique",
    description: "Pilote les plateformes techniques et l'infrastructure.",
  },
  {
    type: DepartmentType.OPERATIONS,
    name: "Direction des Opérations",
    description: "Coordonne la production des services et de la logistique.",
  },
  {
    type: DepartmentType.OTHERS,
    name: "Direction Générale",
    description: "Regroupe les fonctions transversales (PDG, gouvernance, comex).",
  },
];

const serviceDefinitions = [
  {
    departmentType: DepartmentType.OPERATIONS,
    type: ServiceType.INFORMATION,
    name: "Service Information",
    description: "Pilote les processus d'information auprès des métiers et des partenaires.",
  },
  {
    departmentType: DepartmentType.OPERATIONS,
    type: ServiceType.REPUTATION,
    name: "Service Réputation",
    description: "Gère la communication institutionnelle, la qualité perçue et les retours clients.",
  },
  {
    departmentType: DepartmentType.OPERATIONS,
    type: ServiceType.QUALITE,
    name: "Service Qualité",
    description: "Assure le suivi des indicateurs qualité et des audits internes.",
  },
];

type EmployeeSeedDefinition = {
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  role: EmployeeRole;
  departmentType: DepartmentType;
  serviceType?: ServiceType;
};

const employeeDefinitions: EmployeeSeedDefinition[] = [
  {
    email: "pdg@conge.local",
    firstName: "Clémence",
    lastName: "PDG",
    jobTitle: "Président Directeur Général",
    role: EmployeeRole.CEO,
    departmentType: DepartmentType.OTHERS,
  },
  {
    email: "comptable.daf@conge.local",
    firstName: "Théo",
    lastName: "Comptable",
    jobTitle: "Comptable DAF",
    role: EmployeeRole.ACCOUNTANT,
    departmentType: DepartmentType.DAF,
  },
  {
    email: "dsi.admin@conge.local",
    firstName: "Sandra",
    lastName: "DSI",
    jobTitle: "Responsable Infrastructure & Sécurité",
    role: EmployeeRole.DEPT_HEAD,
    departmentType: DepartmentType.DSI,
  },
  {
    email: "directeur.operations@conge.local",
    firstName: "Matthias",
    lastName: "Ops",
    jobTitle: "Directeur des Opérations",
    role: EmployeeRole.DEPT_HEAD,
    departmentType: DepartmentType.OPERATIONS,
  },
  {
    email: "sous-directeur-operations-1@conge.local",
    firstName: "Nora",
    lastName: "Chaal",
    jobTitle: "Sous-Directeur Opérations 1",
    role: EmployeeRole.SERVICE_HEAD,
    departmentType: DepartmentType.OPERATIONS,
    serviceType: ServiceType.INFORMATION,
  },
  {
    email: "sous-directeur-operations-2@conge.local",
    firstName: "Joel",
    lastName: "Nadim",
    jobTitle: "Sous-Directeur Opérations 2",
    role: EmployeeRole.SERVICE_HEAD,
    departmentType: DepartmentType.OPERATIONS,
    serviceType: ServiceType.REPUTATION,
  },
  {
    email: "sous-directeur-operations-3@conge.local",
    firstName: "Lila",
    lastName: "Kone",
    jobTitle: "Sous-Directeur Opérations 3",
    role: EmployeeRole.SERVICE_HEAD,
    departmentType: DepartmentType.OPERATIONS,
    serviceType: ServiceType.QUALITE,
  },
];

type DepartmentMap = Record<DepartmentType, { id: string }>;
type ServiceMap = Partial<Record<ServiceType, { id: string }>>;

async function waitForDatabaseReady() {
  const maxAttempts = 12;
  const delayMs = 2000;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await prisma.$runCommandRaw({ ping: 1 });
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(`MongoDB n'est pas prêt après ${maxAttempts} tentatives: ${(error as Error).message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function ensureDepartments(): Promise<DepartmentMap> {
  const map = {} as DepartmentMap;

  for (const definition of departments) {
    const department = await prisma.department.upsert({
      where: { type: definition.type },
      update: { name: definition.name, description: definition.description },
      create: { type: definition.type, name: definition.name, description: definition.description },
    });
    map[definition.type] = { id: department.id };
  }

  return map;
}

async function ensureServices(departmentMap: DepartmentMap): Promise<ServiceMap> {
  const map = {} as ServiceMap;

  for (const definition of serviceDefinitions) {
    const department = departmentMap[definition.departmentType];
    if (!department) {
      throw new Error(`Département manquant pour ${definition.departmentType} (service ${definition.type})`);
    }

    const service = await prisma.service.upsert({
      where: {
        departmentId_type: {
          departmentId: department.id,
          type: definition.type,
        },
      },
      update: {
        name: definition.name,
        description: definition.description,
      },
      create: {
        departmentId: department.id,
        type: definition.type,
        name: definition.name,
        description: definition.description,
      },
    });

    map[definition.type] = { id: service.id };
  }

  return map;
}

async function seedEmployees(departmentMap: DepartmentMap) {
  const services = await ensureServices(departmentMap);

  for (const employee of employeeDefinitions) {
    const exists = await prisma.employee.findUnique({ where: { email: employee.email } });
    if (exists) {
      console.log(`✅ ${employee.email} existe déjà, aucun changement effectué.`);
      continue;
    }

    const department = departmentMap[employee.departmentType];
    if (!department) {
      throw new Error(`Département manquant pour type ${employee.departmentType}`);
    }

    const passwordHash = await bcrypt.hash(DEFAULT_SEED_PASSWORD, 12);

    const service = employee.serviceType ? services[employee.serviceType] : undefined;

    await prisma.employee.create({
      data: {
        email: employee.email,
        firstName: employee.firstName,
        lastName: employee.lastName,
        jobTitle: employee.jobTitle,
        role: employee.role,
        status: EmployeeStatus.ACTIVE,
        departmentId: department.id,
        serviceId: service?.id,
        hireDate: new Date(),
        password: passwordHash,
      },
    });

    console.log(`✨ Créé ${employee.email} (${employee.role}).`);
  }
}

async function main() {
  await waitForDatabaseReady();
  const departmentMap = await ensureDepartments();
  await seedEmployees(departmentMap);
  console.log(`✅ Tous les comptes de base sont en place (mot de passe par défaut : ${DEFAULT_SEED_PASSWORD}).`);
}

main()
  .catch((error) => {
    console.error("Erreur lors du seed :", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
