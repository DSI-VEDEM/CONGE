export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "API Congé",
    version: "1.0.0",
    description: "Documentation des routes (Auth, Employees, Departments, Services, Responsables).",
  },
  servers: [{ url: "http://localhost:3000" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/api/auth/login": {
      post: {
        summary: "Connexion (email ou matricule)",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["identifier", "password"],
                properties: {
                  identifier: { type: "string", example: "CEO001" },
                  password: { type: "string", example: "Passw0rd!" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "OK" },
          "401": { description: "Identifiants invalides" },
        },
      },
    },

    "/api/auth/register": {
      post: {
        summary: "Créer un employé",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["firstName", "lastName", "email", "password"],
                properties: {
                  firstName: { type: "string" },
                  lastName: { type: "string" },
                  email: { type: "string" },
                  matricule: { type: "string", nullable: true },
                  password: { type: "string" },
                  isCeo: { type: "boolean" },
                  departmentId: { type: "string", nullable: true },
                  serviceId: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Créé" } },
      },
    },

    "/api/auth/me": {
      get: {
        summary: "Profil connecté",
        responses: { "200": { description: "OK" }, "401": { description: "Non authentifié" } },
      },
    },

    "/api/departments": {
      get: { summary: "Lister les départements", responses: { "200": { description: "OK" } } },
      post: {
        summary: "Créer un département",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["type", "name"],
                properties: {
                  type: { type: "string", enum: ["DAF", "DSI", "OPERATIONS", "OTHERS"] },
                  name: { type: "string" },
                  description: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Créé" }, "409": { description: "Déjà existant" } },
      },
    },

    "/api/services": {
      get: { summary: "Lister les services", responses: { "200": { description: "OK" } } },
      post: {
        summary: "Créer un service",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["departmentId", "type", "name"],
                properties: {
                  departmentId: { type: "string" },
                  type: { type: "string", enum: ["INFORMATION", "REPUTATION", "QUALITE"] },
                  name: { type: "string" },
                  description: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Créé" } },
      },
    },

    "/api/employees": {
      get: {
        summary: "Lister les employés",
        parameters: [{ name: "q", in: "query", required: false, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      },
      post: {
        summary: "Créer un employé",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { "201": { description: "Créé" } },
      },
    },

    "/api/employee-documents": {
      get: {
        summary: "Lister les documents RH (personnels ou globaux pour PDG/Comptable)",
        parameters: [
          { name: "employeeId", in: "query", required: false, schema: { type: "string" } },
          {
            name: "type",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: [
                "ID_CARD",
                "BIRTH_CERTIFICATE",
                "SPOUSE_BIRTH_CERTIFICATE",
                "CHILD_BIRTH_CERTIFICATE",
                "CURRICULUM_VITAE",
                "COVER_LETTER",
                "GEOGRAPHIC_LOCATION",
                "CONTRACT",
              ],
            },
          },
        ],
        responses: { "200": { description: "OK" } },
      },
      post: {
        summary: "Ajouter un document RH (interdit au PDG, comptable = uniquement ses documents)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["type", "fileName", "fileDataUrl"],
                properties: {
                  employeeId: { type: "string", nullable: true },
                  type: {
                    type: "string",
                    enum: [
                      "ID_CARD",
                      "BIRTH_CERTIFICATE",
                      "SPOUSE_BIRTH_CERTIFICATE",
                      "CHILD_BIRTH_CERTIFICATE",
                      "CURRICULUM_VITAE",
                      "COVER_LETTER",
                      "GEOGRAPHIC_LOCATION",
                      "CONTRACT",
                    ],
                  },
                  relatedPersonName: {
                    type: "string",
                    nullable: true,
                    description: "Nom du conjoint ou de l'enfant (requis pour les types conjoint/enfant)",
                  },
                  childOrder: {
                    type: "integer",
                    nullable: true,
                    description: "Rang de l'enfant (optionnel, uniquement pour CHILD_BIRTH_CERTIFICATE)",
                  },
                  contractDocumentTypeId: {
                    type: "string",
                    nullable: true,
                    description: "Identifiant du type spécifique pour les documents de type CONTRACT.",
                  },
                  fileName: { type: "string" },
                  fileDataUrl: {
                    type: "string",
                    description: "Data URL base64 d'un PDF/image",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Créé" },
          "403": { description: "Ajout interdit (PDG) ou tentative d'ajout pour un autre employé" },
        },
      },
    },
    "/api/contract-document-types": {
      get: {
        summary: "Lister les catégories spécifiques de documents de contrats",
        responses: { "200": { description: "OK" } },
      },
      post: {
        summary: "Créer un type de document de contrat (comptable uniquement)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Créé" },
          "403": { description: "Accès refusé" },
          "409": { description: "Doublon" },
        },
      },
    },
    "/api/contract-document-types/{id}": {
      delete: {
        summary: "Supprimer un type de document de contrat (comptable uniquement)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Supprimé" },
          "403": { description: "Accès refusé" },
          "404": { description: "Introuvable" },
        },
      },
    },

    "/api/departments/{id}/responsable": {
      get: {
        summary: "Lister responsables actifs d'un département",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      },
      post: {
        summary: "Affecter un responsable",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["employeeId"],
                properties: {
                  employeeId: { type: "string" },
                  role: { type: "string", enum: ["RESPONSABLE", "CO_RESPONSABLE", "ADJOINT"] },
                  supervisorId: {
                    type: "string",
                    nullable: true,
                    description:
                      "Requis en OPERATIONS: ID du Directeur Adjoint (SERVICE_HEAD). Max 3 responsables actifs par Directeur Adjoint.",
                  },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Créé" }, "409": { description: "Limite atteinte" } },
      },
    },
    "/api/departments/{id}": {
      get: {
        summary: "Obtenir un département",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Introuvable" } },
      },
      patch: {
        summary: "Modifier un département",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
      delete: {
        summary: "Supprimer un département",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      },
    },

    "/api/departments/{id}/responsable/{rid}": {
      patch: {
        summary: "Clore une responsabilité",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "rid", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  endAt: { type: "string", format: "date-time", nullable: true },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
      delete: {
        summary: "Supprimer une responsabilité",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "rid", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },

    "/api/services/{id}": {
      get: {
        summary: "Obtenir un service",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Introuvable" } },
      },
      patch: {
        summary: "Modifier un service",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
      delete: {
        summary: "Supprimer un service",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      },
    },

    "/api/employees/{id}": {
      get: {
        summary: "Obtenir un employé",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Introuvable" } },
      },
      patch: {
        summary: "Modifier un employé",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { "200": { description: "OK" } },
      },
      delete: {
        summary: "Supprimer un employé",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      },
    },

    "/api/admin/employees/pending": {
      get: {
        summary: "Lister les employés en attente (admin DSI)",
        responses: { "200": { description: "OK" }, "403": { description: "Accès refusé" } },
      },
    },

    "/api/admin/employees/{id}/status": {
      patch: {
        summary: "Valider ou refuser un employé (admin DSI)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["status"],
                properties: {
                  status: { type: "string", enum: ["ACTIVE", "REJECTED"] },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" }, "409": { description: "Déjà traité" } },
      },
    },

    "/api/manager/team/{id}": {
      delete: {
        summary: "Retirer un membre d'équipe",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      },
    },

    "/api/leave-requests": {
      post: {
        summary: "Créer une demande de congé",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["type", "startDate", "endDate"],
                properties: {
                  type: { type: "string" },
                  startDate: { type: "string", format: "date-time" },
                  endDate: { type: "string", format: "date-time" },
                  reason: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Créé" } },
      },
    },

    "/api/leave-requests/my": {
      get: { summary: "Mes demandes", responses: { "200": { description: "OK" } } },
    },

    "/api/leave-requests/pending": {
      get: { summary: "Demandes en attente", responses: { "200": { description: "OK" } } },
    },

    "/api/leave-requests/history": {
      get: {
        summary: "Historique des demandes",
        parameters: [
          { name: "mine", in: "query", required: false, schema: { type: "string" } },
          { name: "scope", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },

    "/api/leave-requests/{id}/approve": {
      post: {
        summary: "Approuver une demande",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { type: "object", properties: { comment: { type: "string" } } } } },
        },
        responses: { "200": { description: "OK" } },
      },
    },

    "/api/leave-requests/{id}/reject": {
      post: {
        summary: "Refuser une demande",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { type: "object", properties: { comment: { type: "string" } } } } },
        },
        responses: { "200": { description: "OK" } },
      },
    },

    "/api/leave-requests/{id}/escalate": {
      post: {
        summary: "Escalader une demande",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  toRole: { type: "string", enum: ["DEPT_HEAD", "SERVICE_HEAD", "CEO"] },
                  comment: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },

    "/api/leave-requests/{id}/cancel": {
      post: {
        summary: "Annuler une demande",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { type: "object", properties: { comment: { type: "string" } } } } },
        },
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/leaves": {
      get: {
        summary: "Lister les demandes",
        parameters: [{ name: "mine", in: "query", required: false, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      },
      post: {
        summary: "Créer une demande de congé",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["type", "startDate", "endDate"],
                properties: {
                  type: { type: "string" },
                  startDate: { type: "string", format: "date-time" },
                  endDate: { type: "string", format: "date-time" },
                  reason: { type: "string", nullable: true },
                  remainingTasks: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Créé" } },
      },
    },

    "/api/leaves/history": {
      get: {
        summary: "Historique des demandes",
        parameters: [
          { name: "mine", in: "query", required: false, schema: { type: "string" } },
          { name: "scope", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },

    "/api/leaves/inbox": {
      get: { summary: "Boîte de réception des demandes", responses: { "200": { description: "OK" } } },
    },

    "/api/leaves/{id}/decide": {
      post: {
        summary: "Traiter une demande (approve/reject/escalate/cancel)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["type"],
                properties: {
                  type: { type: "string", enum: ["APPROVE", "REJECT", "ESCALATE", "CANCEL"] },
                  comment: { type: "string", nullable: true },
                  toEmployeeId: { type: "string", nullable: true },
                  toRole: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" }, "400": { description: "Requête invalide" } },
      },
    },
  },
} as const;
