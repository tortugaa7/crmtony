window.CRM_CONFIG = {
  companyName: 'Tony Acabamentos',
  shortName: 'TONY',
  productName: 'CRM',
  storageKey: 'tony_crm_clients_v2',
  whatsappCountryCode: '55',
  whatsappGreeting: 'Olá{name}! Tudo bem? Aqui é da Tony Acabamentos.',
  maxHistoryEntries: 40,
  backupFilePrefix: 'tony-crm-backup',
  reportFilePrefix: 'relatorio-tony-crm',
  closedStageId: 'closed',
  partnerStorageKey: 'tony_crm_partners_v1',
  partnerTypes: [
    { id: 'architect', label: 'Arquiteto(a)' },
    { id: 'builder', label: 'Construtor(a)' },
    { id: 'other', label: 'Outro parceiro' }
  ],
  sources: ['WhatsApp', 'Instagram', 'Tráfego pago', 'Indicação', 'Cliente antigo', 'Orgânico', 'Outro'],
  priorities: [
    { id: 'low', label: 'Baixa' },
    { id: 'medium', label: 'Média' },
    { id: 'high', label: 'Alta' },
    { id: 'urgent', label: 'Urgente' }
  ],
  stages: [
    { id: 'whatsapp', label: 'Chegou no WhatsApp', group: 'Comercial', short: 'WhatsApp' },
    { id: 'hot', label: 'Propenso a fechar', group: 'Comercial', short: 'Quente' },
    { id: 'budget', label: 'Aguardando orçamento', group: 'Comercial', short: 'Orçamento' },
    { id: 'closed', label: 'Fechou com a gente', group: 'Comercial', short: 'Fechado' },
    { id: 'measurement', label: 'Aguardando medição', group: 'Operação', short: 'Medição' },
    { id: 'production', label: 'Em produção', group: 'Operação', short: 'Produção' },
    { id: 'ready', label: 'Produção finalizada / aguardando instalação', group: 'Operação', short: 'Aguardando instalação' },
    { id: 'installation', label: 'Em instalação', group: 'Operação', short: 'Instalação' },
    { id: 'post_sale', label: 'Pós-venda', group: 'Operação', short: 'Pós-venda' }
  ]
};
