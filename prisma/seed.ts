import pkg, { type DepartmentType, type EmployeeRole, type ServiceType } from "@prisma/client";
const {
  PrismaClient,
  DepartmentType: DepartmentTypeEnum,
  EmployeeRole: EmployeeRoleEnum,
  EmployeeStatus,
  ServiceType: ServiceTypeEnum,
  ResponsibilityRole: ResponsibilityRoleEnum,
} = pkg;
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();
const DEFAULT_SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

// Ce seed initialise les départements/services/roles clés et garantit que les comptes d'administration
// existent sans dupliquer les enregistrements (upsert + vérification `findUnique`).

const departments = [
  {
    type: DepartmentTypeEnum.DAF,
    name: "Direction Administrative et Financière",
    description: "Supervise la comptabilité, la trésorerie et les audits internes.",
  },
  {
    type: DepartmentTypeEnum.DSI,
    name: "Direction du Service d'Informatique",
    description: "Pilote les plateformes techniques et l'infrastructure.",
  },
  {
    type: DepartmentTypeEnum.OPERATIONS,
    name: "Direction des Opérations",
    description: "Coordonne la production des services et de la logistique.",
  },
  {
    type: DepartmentTypeEnum.OTHERS,
    name: "Direction Générale",
    description: "Regroupe les fonctions transversales (PDG, gouvernance, comex).",
  },
];

const serviceDefinitions = [
  {
    departmentType: DepartmentTypeEnum.OPERATIONS,
    type: ServiceTypeEnum.INFORMATION,
    name: "Service Information",
    description: "Pilote les processus d'information auprès des métiers et des partenaires.",
  },
  {
    departmentType: DepartmentTypeEnum.OPERATIONS,
    type: ServiceTypeEnum.REPUTATION,
    name: "Service Réputation",
    description: "Gère la communication institutionnelle, la qualité perçue et les retours clients.",
  },
  {
    departmentType: DepartmentTypeEnum.OPERATIONS,
    type: ServiceTypeEnum.QUALITE,
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
  matricule?: string;
  serviceType?: ServiceType;
};

const employeeDefinitions: EmployeeSeedDefinition[] = [
  {
    email: "fabrice@veilleurdesmedias.com",
    firstName: "Fabrice",
    lastName: "PIOFRET",
    jobTitle: "Président Directeur Général",
    role: EmployeeRoleEnum.CEO,
    departmentType: DepartmentTypeEnum.OTHERS,
    matricule: "001A",
  },
  {
    email: "comptabilite@veilleurdesmedias.com",
    firstName: "Matirangue",
    lastName: "SANOGO",
    jobTitle: "Comptable",
    role: EmployeeRoleEnum.ACCOUNTANT,
    departmentType: DepartmentTypeEnum.DAF,
    matricule: "013",
  },
  {
    email: "franck@veilleurdesmedias.com",
    firstName: "Franck-Emmanuel",
    lastName: "OUFFOUET",
    jobTitle: "Directeur du Service Informatique",
    role: EmployeeRoleEnum.DEPT_HEAD,
    departmentType: DepartmentTypeEnum.DSI,
    matricule: "001",
  },
  {
    email: "dramane@veilleurdesmedias.com",
    firstName: "Dramane",
    lastName: "TRAORE",
    jobTitle: "Directeur des Opérations",
    role: EmployeeRoleEnum.DEPT_HEAD,
    departmentType: DepartmentTypeEnum.OPERATIONS,
    matricule: "007",
  },
  {
    email: "stephen@veilleurdesmedias.com",
    firstName: "Stephen Didier",
    lastName: "KOUAKOU",
    jobTitle: "Sous-directeur Information",
    role: EmployeeRoleEnum.SERVICE_HEAD,
    departmentType: DepartmentTypeEnum.OPERATIONS,
    serviceType: ServiceTypeEnum.INFORMATION,
    matricule: "014",
  },
  {
    email: "edmon@veilleurdesmedias.com",
    firstName: "Edmond",
    lastName: "KONAN",
    jobTitle: "Sous-directeur Réputation",
    role: EmployeeRoleEnum.SERVICE_HEAD,
    departmentType: DepartmentTypeEnum.OPERATIONS,
    serviceType: ServiceTypeEnum.REPUTATION,
    matricule: "019",
  },
  {
    email: "appolon@veilleurdesmedias.com",
    firstName: "Appolon Franck",
    lastName: "DOGO",
    jobTitle: "Sous-directeur Qualité",
    role: EmployeeRoleEnum.SERVICE_HEAD,
    departmentType: DepartmentTypeEnum.OPERATIONS,
    serviceType: ServiceTypeEnum.QUALITE,
    matricule: "017",
  },
];

type DepartmentMap = Record<DepartmentType, { id: string }>;
type ServiceMap = Partial<Record<ServiceType, { id: string }>>;

// Attend que Mongo soit prêt avant de lancer les inserts (utile en CI / Docker compose up).
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

// Crée ou met à jour les départements référencés, retourne une map pour éviter les recherches répétées.
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

// Associe les services aux départements existants, en conservant une référence par type.
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

// Crée les comptes utilisateurs seedés en utilisant les départements/services déjà assurés.
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

    // Toutes les créations partagent le même mot de passe par défaut, haché ici.
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
        matricule: employee.matricule ?? null,
        hireDate: new Date(),
        password: passwordHash,
      },
    });

    console.log(`✨ Créé ${employee.email} (${employee.role}).`);
  }
}

async function ensureDsiResponsibility(departmentMap: DepartmentMap) {
  const dsiDepartment = departmentMap[DepartmentTypeEnum.DSI];
  if (!dsiDepartment) {
    throw new Error("La DSI n’est pas initialisée dans la base.");
  }

  const dsiHead = await prisma.employee.findFirst({
    where: {
      departmentId: dsiDepartment.id,
      role: EmployeeRoleEnum.DEPT_HEAD,
      status: EmployeeStatus.ACTIVE,
    },
    select: { id: true, email: true },
  });

  if (!dsiHead) {
    console.warn("⚠️ Aucun directeur DSI actif trouvé, impossible d’attribuer la responsabilité.");
    return;
  }

  const existing = await prisma.departmentResponsibility.findFirst({
    where: {
      departmentId: dsiDepartment.id,
      employeeId: dsiHead.id,
      endAt: null,
    },
    select: { id: true },
  });

  if (existing) {
    console.log(`✅ ${dsiHead.email ?? dsiHead.id} est déjà responsable DSI.`);
    return;
  }

  await prisma.departmentResponsibility.create({
    data: {
      departmentId: dsiDepartment.id,
      employeeId: dsiHead.id,
      role: ResponsibilityRoleEnum.RESPONSABLE,
    },
  });

  console.log(`🚀 ${dsiHead.email ?? dsiHead.id} devient responsable DSI.`);
}

// Point d’entrée : vérifie Mongo, initialise les données et logge l’état final.
async function main() {
  await waitForDatabaseReady();
  const departmentMap = await ensureDepartments();
  await seedEmployees(departmentMap);
  await ensureDsiResponsibility(departmentMap);
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
