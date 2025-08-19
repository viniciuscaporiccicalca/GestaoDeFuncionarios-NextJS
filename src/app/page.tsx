"use client";

import { faChartBar, faPenToSquare, faPlus, faSort, faSortDown, faSortUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ArcElement, CategoryScale, Chart, Legend, LinearScale, PieController, Tooltip } from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

// --- Definições de Tipo e Constantes ---
interface Funcionario {
  ID: number;
  NOME: string;
  CARGO: string;
  SETOR: string;
  Unidade: string;
  "Tipo de Contrato": string;
  "Data Nasc.": Date | null;
  "Data Adm.": Date | null;
  Idade: number | null;
  "Tempo de Empresa": number | null;
  "Faixa Etária": string | null;
  "Faixa Tempo Empresa": string | null;
  [key: string]: any;
}

const meses = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const tiposDeContrato = ["CLT", "Estágio", "Terceirizado", "Sócio", "Outros"];

const setoresDisponiveis = ["DEV", "CRM", "STI", "ADM", "UNI", "WEB", "MKT", "ISM"];
const unidadesDisponiveis = ["CM", "PV"];

const ordemFaixaEtaria = [
  "Até 24 anos (Jovens talentos)",
  "25 a 34 anos (Profissionais em expansão)",
  "35 a 44 anos (Consolidação e experiência)",
  "45 a 54 anos (Lideranças experientes)",
  "55 anos ou mais (Sêniores/Pré-aposentadoria)",
];
const ordemTempoEmpresa = [
  "menos de 1 ano",
  "1 a 4 anos",
  "5 a 9 anos",
  "10 a 19 anos",
  "20 a 29 anos",
  "30 a 39 anos",
  "40+",
];
const initialNewEmployeeState = {
  NOME: "",
  CARGO: "",
  SETOR: "",
  Unidade: "",
  "Tipo de Contrato": "CLT",
  "Data Nasc.": "",
  "Data Adm.": "",
};

export default function GestaoFuncionariosPage() {
  Chart.register(ArcElement, Tooltip, Legend, PieController, CategoryScale, LinearScale, ChartDataLabels);

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [todosFuncionarios, setTodosFuncionarios] = useState<Funcionario[]>([]);
  const [funcionariosFiltrados, setFuncionariosFiltrados] = useState<Funcionario[]>([]);
  const [filters, setFilters] = useState({
    searchTerm: "",
    setor: "",
    unidade: "",
    tipoContrato: "",
    aniversario: "",
    admissao: "",
    faixaEtaria: "",
    tempoEmpresa: "",
  });
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: string } | null>(null);

  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const [isCadastroModalOpen, setIsCadastroModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [chartData, setChartData] = useState<{ title: string; labels: string[]; values: number[] } | null>(null);

  const [newEmployee, setNewEmployee] = useState(initialNewEmployeeState);
  const [employeeToEdit, setEmployeeToEdit] = useState<Funcionario | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);
  const excelDateToJSDate = (excelDate: any): Date | null => {
    if (typeof excelDate !== "number" || isNaN(excelDate)) return null;
    const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
    if (isNaN(date.getTime())) return null;
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() + userTimezoneOffset);
  };
  const getFaixaEtaria = (idade: number | null): string | null => {
    if (idade === null) return null;
    if (idade <= 24) return ordemFaixaEtaria[0];
    if (idade <= 34) return ordemFaixaEtaria[1];
    if (idade <= 44) return ordemFaixaEtaria[2];
    if (idade <= 54) return ordemFaixaEtaria[3];
    return ordemFaixaEtaria[4];
  };
  const getTempoEmpresa = (anos: number | null): string | null => {
    if (anos === null) return null;
    if (anos < 1) return ordemTempoEmpresa[0];
    if (anos <= 4) return ordemTempoEmpresa[1];
    if (anos <= 9) return ordemTempoEmpresa[2];
    if (anos <= 19) return ordemTempoEmpresa[3];
    if (anos <= 29) return ordemTempoEmpresa[4];
    if (anos <= 39) return ordemTempoEmpresa[5];
    return ordemTempoEmpresa[6];
  };
  const processarDadosFuncionarios = (jsonData: any[]) => {
    return jsonData.filter(Boolean).map(f => {
      const dataNasc = excelDateToJSDate(f["Data Nasc."]);
      const dataAdm = excelDateToJSDate(f["Data Adm."]);
      const idade = dataNasc ? new Date().getFullYear() - dataNasc.getFullYear() : null;
      const tempoEmpresaAnos = dataAdm
        ? (new Date().getTime() - dataAdm.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
        : null;
      return {
        ...f,
        "Data Nasc.": dataNasc,
        "Data Adm.": dataAdm,
        Idade: idade,
        "Tempo de Empresa": tempoEmpresaAnos,
        "Faixa Etária": getFaixaEtaria(idade),
        "Faixa Tempo Empresa": getTempoEmpresa(tempoEmpresaAnos),
      };
    });
  };

  const carregarDados = async () => {
    try {
      const response = await fetch(`/funcionarios.xlsx?v=${new Date().getTime()}`);
      if (!response.ok) throw new Error(`Erro: ${response.statusText}`);
      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);
      setTodosFuncionarios(processarDadosFuncionarios(jsonData));
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      alert("Não foi possível carregar os dados.");
      setTodosFuncionarios([]);
    }
  };
  useEffect(() => {
    carregarDados();
  }, []);
  useEffect(() => {
    const dadosFiltrados = todosFuncionarios.filter(
      f =>
        (!filters.searchTerm || (f.NOME || "").toLowerCase().includes(filters.searchTerm.toLowerCase())) &&
        (!filters.setor || f.SETOR === filters.setor) &&
        (!filters.unidade || f.Unidade === filters.unidade) &&
        (!filters.tipoContrato || f["Tipo de Contrato"] === filters.tipoContrato) &&
        (!filters.aniversario || (f["Data Nasc."] && f["Data Nasc."].getMonth() === parseInt(filters.aniversario))) &&
        (!filters.admissao || (f["Data Adm."] && f["Data Adm."].getMonth() === parseInt(filters.admissao))) &&
        (!filters.faixaEtaria || f["Faixa Etária"] === filters.faixaEtaria) &&
        (!filters.tempoEmpresa || f["Faixa Tempo Empresa"] === filters.tempoEmpresa)
    );
    if (sortConfig !== null) {
      dadosFiltrados.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        if (sortConfig.key === "Data Nasc." || sortConfig.key === "Data Adm.") {
          valA = valA ? valA.getTime() : 0;
          valB = valB ? valB.getTime() : 0;
        }
        if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
        if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    setFuncionariosFiltrados(dadosFiltrados);
  }, [filters, sortConfig, todosFuncionarios]);

  useEffect(() => {
    if (isChartModalOpen && chartData && chartRef.current) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
      const ctx = chartRef.current.getContext("2d");
      if (ctx) {
        const colors = chartData.labels.map((_, i) => `hsl(${(i * 360) / chartData.labels.length}, 70%, 50%)`);
        chartInstanceRef.current = new Chart(ctx, {
          type: "pie",
          data: {
            labels: chartData.labels,
            datasets: [
              {
                label: chartData.title,
                data: chartData.values,
                backgroundColor: colors,
                borderColor: isDarkMode ? "#1f2937" : "#fff",
                borderWidth: 1,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: "top", labels: { color: isDarkMode ? "#fff" : "#666" } },
              datalabels: {
                color: "#fff",
                font: { weight: "bold" },
                formatter: (value, context) => {
                  const dataPoints = context.chart.data.datasets[0].data.map(d => (typeof d === "number" ? d : 0));
                  const total = dataPoints.reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? (value / total) * 100 : 0;
                  if (percentage < 3) return "";
                  return `${percentage.toFixed(1)}%`;
                },
              },
            },
          },
        });
      }
    }
  }, [isChartModalOpen, chartData, isDarkMode]);

  const setoresUnicos = useMemo(
    () => [...new Set(todosFuncionarios.map(f => f.SETOR).filter(Boolean))].sort(),
    [todosFuncionarios]
  );
  const cargosUnicos = useMemo(
    () => [...new Set(todosFuncionarios.map(f => f.CARGO).filter(Boolean))].sort(),
    [todosFuncionarios]
  );
  const unidadesUnicas = useMemo(
    () => [...new Set(todosFuncionarios.map(f => f.Unidade).filter(Boolean))].sort(),
    [todosFuncionarios]
  );
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  const handleSort = (key: string) => {
    const direction = sortConfig && sortConfig.key === key && sortConfig.direction === "asc" ? "desc" : "asc";
    setSortConfig({ key, direction });
  };
  const handleClearFilters = () => {
    setFilters({
      searchTerm: "",
      setor: "",
      unidade: "",
      tipoContrato: "",
      aniversario: "",
      admissao: "",
      faixaEtaria: "",
      tempoEmpresa: "",
    });
    setSortConfig(null);
  };

  const handleNewEmployeeChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewEmployee(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newEmployee.NOME || !newEmployee.CARGO || !newEmployee["Data Adm."] || !newEmployee["Data Nasc."] || !newEmployee.SETOR || !newEmployee.Unidade) {
      alert("Todos os campos com (*) são obrigatórios.");
      return;
    }
    
    const dataNascimento = new Date(newEmployee["Data Nasc."]);
    const dataAdmissao = new Date(newEmployee["Data Adm."]);
    
    dataNascimento.setMinutes(dataNascimento.getMinutes() + dataNascimento.getTimezoneOffset());
    dataAdmissao.setMinutes(dataAdmissao.getMinutes() + dataAdmissao.getTimezoneOffset());

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); 

    if (dataAdmissao > hoje) {
      alert("A data de admissão não pode ser uma data futura.");
      return;
    }

    if (dataAdmissao < dataNascimento) {
      alert("A data de admissão não pode ser anterior à data de nascimento.");
      return;
    }
    
    const dataLimite13Anos = new Date(hoje.getFullYear() - 13, hoje.getMonth(), hoje.getDate());

    if (dataNascimento > dataLimite13Anos) {
      alert("O funcionário deve ter pelo menos 13 anos de idade.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/cadastrar-funcionario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEmployee),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Falha ao salvar.");
      }
      await carregarDados();
      alert("Funcionário salvo com sucesso!");
      setIsCadastroModalOpen(false);
      setNewEmployee(initialNewEmployeeState);
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      alert(`Erro: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenEditModal = (employee: Funcionario) => {
    const formatDate = (date: Date | null) =>
      date ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split("T")[0] : "";
    setEmployeeToEdit({
      ...employee,
      "Data Nasc.": formatDate(employee["Data Nasc."]),
      "Data Adm.": formatDate(employee["Data Adm."]),
    } as any);
    setIsEditModalOpen(true);
  };
  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setEmployeeToEdit(prev => (prev ? { ...prev, [e.target.name]: e.target.value } : null));
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeToEdit) return;

    const dataAdmissao = new Date(employeeToEdit["Data Adm."]);
    dataAdmissao.setMinutes(dataAdmissao.getMinutes() + dataAdmissao.getTimezoneOffset());
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    if (dataAdmissao > hoje) {
      alert("A data de admissão não pode ser uma data futura.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/manage-employee", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(employeeToEdit),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Falha ao atualizar.");
      }
      await carregarDados();
      alert("Funcionário atualizado com sucesso!");
      setIsEditModalOpen(false);
      setEmployeeToEdit(null);
    } catch (error: any) {
      console.error("Erro ao atualizar:", error);
      alert(`Erro: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEmployee = async (employeeId: number) => {
    if (!window.confirm("Tem certeza que deseja excluir este funcionário?")) {
      return;
    }
    try {
      const response = await fetch(`/api/manage-employee?id=${employeeId}`, { method: "DELETE" });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Falha ao excluir.");
      }
      await carregarDados();
      alert("Funcionário excluído com sucesso!");
    } catch (error: any) {
      console.error("Erro ao excluir:", error);
      alert(`Erro: ${error.message}`);
    }
  };

  // ✅ NOVA CONFIGURAÇÃO DE GRÁFICO PARA CARGO
  const chartsConfig = [
    { id: "chart-setor", title: "Distribuição por Setor", key: "SETOR" },
    { id: "chart-unidade", title: "Distribuição por Unidade", key: "Unidade" },
    {
      id: "chart-tipo-contrato",
      title: "Distribuição por Tipo de Contrato",
      key: "Tipo de Contrato",
      order: tiposDeContrato,
    },
    { id: "chart-faixa-etaria", title: "Distribuição por Faixa Etária", key: "Faixa Etária", order: ordemFaixaEtaria },
    {
      id: "chart-tempo-empresa",
      title: "Distribuição por Tempo de Empresa",
      key: "Faixa Tempo Empresa",
      order: ordemTempoEmpresa,
    },
    { id: "chart-aniversariantes", title: "Aniversariantes por Mês", key: "Data Nasc.", isMonth: true },
    { id: "chart-admissao", title: "Admissões por Mês", key: "Data Adm.", isMonth: true },
    { id: "chart-cargo", title: "Distribuição por Cargo", key: "CARGO" },
  ];

  // ✅ ATUALIZAÇÃO DO CABEÇALHO PARA INCLUIR ÍCONE NO CARGO
  const tableHeaders = [
    { key: "NOME", label: "Nome" },
    { key: "CARGO", label: "Cargo", chartIndex: 7 },
    { key: "SETOR", label: "Setor", chartIndex: 0 },
    { key: "Unidade", label: "Unidade", chartIndex: 1 },
    { key: "Tipo de Contrato", label: "Tipo Contrato", chartIndex: 2 },
    { key: "Idade", label: "Idade", chartIndex: 3 },
    { key: "Data Nasc.", label: "Data Nasc.", chartIndex: 5 },
    { key: "Tempo de Empresa", label: "Tempo Empresa", chartIndex: 4 },
    { key: "Data Adm.", label: "Data Adm.", chartIndex: 6 },
  ];
  const handleOpenChart = (chartConfig: any) => {
    const data = funcionariosFiltrados.reduce(
      (acc, f) => {
        const category: string | null = chartConfig.isMonth
          ? f[chartConfig.key]
            ? meses[f[chartConfig.key].getMonth()]
            : null
          : f[chartConfig.key];
        if (category) {
          acc[category] = (acc[category] || 0) + 1;
        }
        return acc;
      },
      {} as { [key: string]: number }
    );
    const order = chartConfig.isMonth ? meses : chartConfig.order;
    const labels = order ? order.filter(k => data[k]) : Object.keys(data).sort();
    const values = labels.map(k => data[k]);
    if (labels.length > 0) {
      setChartData({ title: chartConfig.title, labels, values });
      setIsChartModalOpen(true);
    } else {
      alert("Não há dados para exibir no gráfico com os filtros atuais.");
    }
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <FontAwesomeIcon icon={faSort} className="ml-1 text-gray-400" />;
    }
    if (sortConfig.direction === 'asc') {
      return <FontAwesomeIcon icon={faSortUp} className="ml-1 text-white" />;
    }
    return <FontAwesomeIcon icon={faSortDown} className="ml-1 text-white" />;
  };

  const inputStyle =
    "p-[10px] border border-gray-300 rounded-md bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white";
  const actionBtnStyle =
    "bg-[#3498db] text-white py-2 px-4 rounded-md text-sm font-semibold hover:bg-[#2980b9] transition-colors flex items-center justify-center disabled:bg-gray-400 disabled:cursor-not-allowed";
  const clearBtnStyle =
    "bg-[#e74c3c] text-white py-2 px-4 rounded-md text-sm font-semibold hover:bg-[#c0392b] transition-colors";

  return (
    <main className="bg-gray-100 dark:bg-black p-5 font-sans transition-colors duration-300">
      <div className="max-w-7xl mx-auto bg-white dark:bg-gray-900 p-6 rounded-lg shadow-md transition-colors duration-300">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-[#2c3e50] dark:text-gray-200 m-0">
              Painel de Gestão de Funcionários
            </h1>
          </div>
        </header>

        <div className="mb-6">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-4">
            <input
              type="text"
              name="searchTerm"
              placeholder="Buscar por nome..."
              value={filters.searchTerm}
              onChange={handleFilterChange}
              className={`${inputStyle} w-full md:w-[250px]`}
            />
            <div className="flex gap-4">
              <button onClick={() => setIsCadastroModalOpen(true)} className={actionBtnStyle}>
                <FontAwesomeIcon icon={faPlus} className="mr-2" /> Adicionar Funcionário
              </button>
              <button onClick={handleClearFilters} className={clearBtnStyle}>
                Limpar Filtros
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <select name="setor" value={filters.setor} onChange={handleFilterChange} className={inputStyle}>
              <option value="">Setor</option>
              {setoresUnicos.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select name="unidade" value={filters.unidade} onChange={handleFilterChange} className={inputStyle}>
              <option value="">Unidade</option>
              {unidadesUnicas.map(u => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <select
              name="tipoContrato"
              value={filters.tipoContrato}
              onChange={handleFilterChange}
              className={inputStyle}
            >
              <option value="">Contrato</option>
              {tiposDeContrato.map(tc => (
                <option key={tc} value={tc}>
                  {tc}
                </option>
              ))}
            </select>
            <select name="aniversario" value={filters.aniversario} onChange={handleFilterChange} className={inputStyle}>
              <option value="">Mês Aniv.</option>
              {meses.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select name="admissao" value={filters.admissao} onChange={handleFilterChange} className={inputStyle}>
              <option value="">Mês Adm.</option>
              {meses.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select name="faixaEtaria" value={filters.faixaEtaria} onChange={handleFilterChange} className={inputStyle}>
              <option value="">Faixa Etária</option>
              {ordemFaixaEtaria.map(f => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select
              name="tempoEmpresa"
              value={filters.tempoEmpresa}
              onChange={handleFilterChange}
              className={inputStyle}
            >
              <option value="">Tempo Empresa</option>
              {ordemTempoEmpresa.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm text-gray-800 dark:text-gray-300">
            <thead className="bg-[#34495e] text-white">
              <tr>
                {tableHeaders.map(({ key, label, chartIndex }) => (
                  <th key={key} className="p-3 text-left font-semibold cursor-pointer" onClick={() => handleSort(key)}>
                    {label} {getSortIcon(key)}
                    {chartIndex !== undefined && (
                      <FontAwesomeIcon
                        icon={faChartBar}
                        className="ml-2 text-gray-400 hover:text-blue-300 hover:scale-125 transition-transform cursor-pointer"
                        onClick={e => {
                          e.stopPropagation();
                          handleOpenChart(chartsConfig[chartIndex]);
                        }}
                      />
                    )}
                  </th>
                ))}
                <th className="p-3 text-left font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {funcionariosFiltrados.map(f => (
                <tr
                  key={f.ID}
                  className="border-b border-gray-200 dark:border-gray-700 even:bg-gray-50 dark:even:bg-gray-800 hover:bg-yellow-300 dark:hover:bg-yellow-500/20"
                >
                  <td className="p-3">{f.NOME || ""}</td>
                  <td className="p-3">{f.CARGO || ""}</td>
                  <td className="p-3">{f.SETOR || ""}</td>
                  <td className="p-3">{f.Unidade || ""}</td>
                  <td className="p-3">{f["Tipo de Contrato"] || ""}</td>
                  <td className="p-3">{f.Idade !== null ? f.Idade : ""}</td>
                  <td className="p-3">
                    {f["Data Nasc."] && !isNaN(f["Data Nasc."].getTime())
                      ? f["Data Nasc."].toLocaleDateString("pt-BR")
                      : ""}
                  </td>
                  <td className="p-3">
                    {f["Tempo de Empresa"] !== null ? `${Math.floor(f["Tempo de Empresa"])} anos` : ""}
                  </td>
                  <td className="p-3">
                    {f["Data Adm."] && !isNaN(f["Data Adm."].getTime())
                      ? f["Data Adm."].toLocaleDateString("pt-BR")
                      : ""}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleOpenEditModal(f)}
                        className="text-blue-500 hover:text-blue-700"
                        title="Editar"
                      >
                        <FontAwesomeIcon icon={faPenToSquare} />
                      </button>
                      <button
                        onClick={() => handleDeleteEmployee(f.ID)}
                        className="text-red-500 hover:text-red-700"
                        title="Excluir"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isChartModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-2xl w-11/12 max-w-3xl relative">
              <button
                className="absolute top-2 right-4 text-3xl font-bold text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
                onClick={() => setIsChartModalOpen(false)}
              >
                &times;
              </button>
              <h2 className="text-xl font-bold text-center mb-4 text-[#2c3e50] dark:text-gray-200">
                {chartData?.title}
              </h2>
              <div className="relative h-[400px] w-full">
                <canvas ref={chartRef}></canvas>
              </div>
            </div>
          </div>
        )}

        {isCadastroModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-2xl w-11/12 max-w-2xl relative">
              <button
                onClick={() => setIsCadastroModalOpen(false)}
                disabled={isSaving}
                className="absolute top-3 right-5 text-3xl font-bold text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
              >
                &times;
              </button>
              <h2 className="text-xl font-bold text-center mb-6 text-[#2c3e50] dark:text-gray-200">
                Cadastrar Novo Funcionário
              </h2>
              <form onSubmit={handleSaveEmployee}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label htmlFor="NOME" className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Nome Completo *
                    </label>
                    <input
                      type="text"
                      id="NOME"
                      name="NOME"
                      required
                      value={newEmployee.NOME}
                      onChange={handleNewEmployeeChange}
                      className={inputStyle}
                    />
                  </div>
                  <div className="flex flex-col">
                    <label htmlFor="CARGO" className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Cargo *
                    </label>
                    <input
                      type="text"
                      id="CARGO"
                      name="CARGO"
                      required
                      value={newEmployee.CARGO}
                      onChange={handleNewEmployeeChange}
                      className={inputStyle}
                      list="cargos-sugestoes"
                    />
                    <datalist id="cargos-sugestoes">
                      {cargosUnicos.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div className="flex flex-col">
                    <label htmlFor="SETOR" className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Setor *
                    </label>
                    <select
                      id="SETOR"
                      name="SETOR"
                      value={newEmployee.SETOR}
                      onChange={handleNewEmployeeChange}
                      className={inputStyle}
                      required
                    >
                      <option value="" disabled>Selecione um Setor</option>
                      {setoresDisponiveis.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label htmlFor="Unidade" className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Unidade *
                    </label>
                     <select
                      id="Unidade"
                      name="Unidade"
                      value={newEmployee.Unidade}
                      onChange={handleNewEmployeeChange}
                      className={inputStyle}
                      required
                    >
                      <option value="" disabled>Selecione uma Unidade</option>
                      {unidadesDisponiveis.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label
                      htmlFor="Tipo de Contrato"
                      className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300"
                    >
                      Tipo de Contrato
                    </label>
                    <select
                      id="Tipo de Contrato"
                      name="Tipo de Contrato"
                      value={newEmployee["Tipo de Contrato"]}
                      onChange={handleNewEmployeeChange}
                      className={inputStyle}
                    >
                      {tiposDeContrato.map(tc => (
                        <option key={tc} value={tc}>
                          {tc}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label htmlFor="Data Nasc." className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Data de Nascimento *
                    </label>
                    <input
                      type="date"
                      id="Data Nasc."
                      name="Data Nasc."
                      value={newEmployee["Data Nasc."]}
                      onChange={handleNewEmployeeChange}
                      className={inputStyle}
                      required
                    />
                  </div>
                  <div className="flex flex-col">
                    <label htmlFor="Data Adm." className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Data de Admissão *
                    </label>
                    <input
                      type="date"
                      id="Data Adm."
                      name="Data Adm."
                      required
                      value={newEmployee["Data Adm."]}
                      onChange={handleNewEmployeeChange}
                      className={inputStyle}
                    />
                  </div>
                </div>
                <div className="pt-6">
                  <button type="submit" className={`${actionBtnStyle} w-full`} disabled={isSaving}>
                    {isSaving ? "Salvando..." : "Salvar Funcionário"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isEditModalOpen && employeeToEdit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-2xl w-11/12 max-w-2xl relative">
              <button
                onClick={() => setIsEditModalOpen(false)}
                disabled={isSaving}
                className="absolute top-3 right-5 text-3xl font-bold text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
              >
                &times;
              </button>
              <h2 className="text-xl font-bold text-center mb-6 text-[#2c3e50] dark:text-gray-200">
                Editar Funcionário
              </h2>
              <form onSubmit={handleUpdateEmployee}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label htmlFor="edit-NOME" className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Nome Completo *
                    </label>
                    <input
                      type="text"
                      id="edit-NOME"
                      name="NOME"
                      required
                      value={employeeToEdit.NOME}
                      onChange={handleEditFormChange}
                      className={inputStyle}
                    />
                  </div>
                  <div className="flex flex-col">
                    <label htmlFor="edit-CARGO" className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Cargo *
                    </label>
                    <input
                      type="text"
                      id="edit-CARGO"
                      name="CARGO"
                      required
                      value={employeeToEdit.CARGO}
                      onChange={handleEditFormChange}
                      className={inputStyle}
                      list="cargos-sugestoes"
                    />
                     <datalist id="cargos-sugestoes">
                      {cargosUnicos.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div className="flex flex-col">
                    <label htmlFor="edit-SETOR" className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Setor *
                    </label>
                    <select
                      id="edit-SETOR"
                      name="SETOR"
                      value={employeeToEdit.SETOR}
                      onChange={handleEditFormChange}
                      className={inputStyle}
                      required
                    >
                       <option value="" disabled>Selecione um Setor</option>
                       {setoresDisponiveis.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label
                      htmlFor="edit-Unidade"
                      className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300"
                    >
                      Unidade *
                    </label>
                    <select
                      id="edit-Unidade"
                      name="Unidade"
                      value={employeeToEdit.Unidade}
                      onChange={handleEditFormChange}
                      className={inputStyle}
                      required
                    >
                      <option value="" disabled>Selecione uma Unidade</option>
                      {unidadesDisponiveis.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label
                      htmlFor="edit-Tipo de Contrato"
                      className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300"
                    >
                      Tipo de Contrato
                    </label>
                    <select
                      id="edit-Tipo de Contrato"
                      name="Tipo de Contrato"
                      value={employeeToEdit["Tipo de Contrato"]}
                      onChange={handleEditFormChange}
                      className={inputStyle}
                    >
                      {tiposDeContrato.map(tc => (
                        <option key={tc} value={tc}>
                          {tc}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label
                      htmlFor="edit-Data Nasc."
                      className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300"
                    >
                      Data de Nascimento *
                    </label>
                    <input
                      type="date"
                      id="edit-Data Nasc."
                      name="Data Nasc."
                      required
                      value={employeeToEdit["Data Nasc."] as any}
                      onChange={handleEditFormChange}
                      className={inputStyle}
                    />
                  </div>
                  <div className="flex flex-col">
                    <label
                      htmlFor="edit-Data Adm."
                      className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300"
                    >
                      Data de Admissão *
                    </label>
                    <input
                      type="date"
                      id="edit-Data Adm."
                      name="Data Adm."
                      required
                      value={employeeToEdit["Data Adm."] as any}
                      onChange={handleEditFormChange}
                      className={inputStyle}
                    />
                  </div>
                </div>
                <div className="pt-6">
                  <button type="submit" className={`${actionBtnStyle} w-full`} disabled={isSaving}>
                    {isSaving ? "Salvando Alterações..." : "Salvar Alterações"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}