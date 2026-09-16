import { defineCopy } from "./language";

const es = {
  title: "Dinero",
  tabs: { report: "Reportes", expenses: "Gastos", supplies: "Insumos" },
  periods: { TODAY: "Hoy", YESTERDAY: "Ayer", LAST_7_DAYS: "Últimos 7 días", LAST_30_DAYS: "Últimos 30 días", THIS_MONTH: "Mes actual", LAST_MONTH: "Mes anterior", LAST_3_MONTHS: "Últimos 3 meses" },
  summary: "Resumen general",
  revenue: "Ingresos", billed: "Citas", lost: "Canceladas o no vino", expenses: "Gastos", supplies: "Insumos", net: "Ganancia neta",
  withoutPrice: (n: number) => (n === 1 ? "1 cita sin precio" : `${n} citas sin precio`),
  topServices: "Servicios por ingresos", specialists: "Desempeño de profesionales", clients: "Clientas por ingresos",
  columns: { name: "Nombre", count: "Citas", revenue: "Ingresos", date: "Fecha", concept: "Concepto", amount: "Monto", item: "Insumo", quantity: "Cantidad", cost: "Costo", note: "Nota" },
  add: "Agregar", remove: "Quitar", export: "Descargar CSV", saved: "Listo.", removed: "Quitado.",
  empty: "Nada en este periodo.", loading: "Leyendo…", loadFailed: "No se pudo leer.",
  managersOnly: "Solo una gerente ve el dinero del salón.", signIn: "Inicia sesión para ver el dinero.",
  needConcept: "Escribe el concepto.", needAmount: "Escribe un monto válido.", needItem: "Escribe el insumo.", needQuantity: "Escribe una cantidad válida.",
};
export type MoneyCopy = typeof es;

export const MONEY_COPY = defineCopy<MoneyCopy>("money", {
  es,
  en: {
    title: "Money",
    tabs: { report: "Reports", expenses: "Expenses", supplies: "Supplies" },
    periods: { TODAY: "Today", YESTERDAY: "Yesterday", LAST_7_DAYS: "Last 7 days", LAST_30_DAYS: "Last 30 days", THIS_MONTH: "This month", LAST_MONTH: "Last month", LAST_3_MONTHS: "Last 3 months" },
    summary: "Overview",
    revenue: "Revenue", billed: "Appointments", lost: "Cancelled or no-show", expenses: "Expenses", supplies: "Supplies", net: "Net profit",
    withoutPrice: (n: number) => (n === 1 ? "1 appointment without a price" : `${n} appointments without a price`),
    topServices: "Services by revenue", specialists: "Staff performance", clients: "Clients by revenue",
    columns: { name: "Name", count: "Appointments", revenue: "Revenue", date: "Date", concept: "Concept", amount: "Amount", item: "Item", quantity: "Quantity", cost: "Cost", note: "Note" },
    add: "Add", remove: "Remove", export: "Download CSV", saved: "Saved.", removed: "Removed.",
    empty: "Nothing in this period.", loading: "Reading…", loadFailed: "Could not read.",
    managersOnly: "Only a manager sees the salon's money.", signIn: "Sign in to see the money.",
    needConcept: "Enter the concept.", needAmount: "Enter a valid amount.", needItem: "Enter the item.", needQuantity: "Enter a valid quantity.",
  },
  pt: {
    title: "Dinheiro",
    tabs: { report: "Relatórios", expenses: "Despesas", supplies: "Insumos" },
    periods: { TODAY: "Hoje", YESTERDAY: "Ontem", LAST_7_DAYS: "Últimos 7 dias", LAST_30_DAYS: "Últimos 30 dias", THIS_MONTH: "Este mês", LAST_MONTH: "Mês passado", LAST_3_MONTHS: "Últimos 3 meses" },
    summary: "Resumo geral",
    revenue: "Receita", billed: "Atendimentos", lost: "Cancelados ou faltou", expenses: "Despesas", supplies: "Insumos", net: "Lucro líquido",
    withoutPrice: (n: number) => (n === 1 ? "1 atendimento sem preço" : `${n} atendimentos sem preço`),
    topServices: "Serviços por receita", specialists: "Desempenho da equipe", clients: "Clientes por receita",
    columns: { name: "Nome", count: "Atendimentos", revenue: "Receita", date: "Data", concept: "Descrição", amount: "Valor", item: "Insumo", quantity: "Quantidade", cost: "Custo", note: "Nota" },
    add: "Adicionar", remove: "Remover", export: "Baixar CSV", saved: "Pronto.", removed: "Removido.",
    empty: "Nada neste período.", loading: "Lendo…", loadFailed: "Não foi possível ler.",
    managersOnly: "Só uma gerente vê o dinheiro do salão.", signIn: "Entre para ver o dinheiro.",
    needConcept: "Escreva a descrição.", needAmount: "Escreva um valor válido.", needItem: "Escreva o insumo.", needQuantity: "Escreva uma quantidade válida.",
  },
});
