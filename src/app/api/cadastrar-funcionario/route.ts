import fs from "fs/promises"; // Usando a versão de promessas do 'fs'
import { NextResponse } from "next/server";
import path from "path";
import * as XLSX from "xlsx";

interface NewEmployeeData {
  NOME: string;
  SETOR: string;
  Unidade: string;
  "Tipo de Contrato": string;
  "Data Nasc.": string;
  "Data Adm.": string;
}

function dateToExcelSerial(dateString: string): number | null {
  if (!dateString) return null;
  const date = new Date(dateString + "T12:00:00Z");
  if (isNaN(date.getTime())) return null;
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  return (date.getTime() - excelEpoch.getTime()) / (24 * 60 * 60 * 1000);
}

export async function POST(request: Request) {
  try {
    const newEmployee: NewEmployeeData = await request.json();

    if (!newEmployee.NOME || !newEmployee["Data Adm."]) {
      return NextResponse.json({ message: "Nome e Data de Admissão são obrigatórios." }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "public", "funcionarios.xlsx");

    let data: any[] = [];
    let workbook: XLSX.WorkBook;

    try {
      const fileBuffer = await fs.readFile(filePath);
      workbook = XLSX.read(fileBuffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      data = XLSX.utils.sheet_to_json(worksheet);
    } catch (error) {
      // Se o arquivo não existir ou estiver vazio, cria um novo workbook
      workbook = XLSX.utils.book_new();
      console.log("Arquivo 'funcionarios.xlsx' não encontrado ou vazio. Um novo será criado.");
    }

    // CORREÇÃO: Adicionando um ID único para o novo funcionário
    const maxId = data.reduce((max, item) => (item.ID > max ? item.ID : max), 0);
    const newId = maxId + 1;

    const employeeToSave = {
      ID: newId, // Adicionando o novo ID
      NOME: newEmployee.NOME,
      SETOR: newEmployee.SETOR,
      Unidade: newEmployee.Unidade,
      "Tipo de Contrato": newEmployee["Tipo de Contrato"],
      "Data Nasc.": dateToExcelSerial(newEmployee["Data Nasc."]),
      "Data Adm.": dateToExcelSerial(newEmployee["Data Adm."]),
    };

    data.push(employeeToSave);

    const newWorksheet = XLSX.utils.json_to_sheet(data, {
      // Garante que o cabeçalho siga a ordem correta
      header: ["ID", "NOME", "SETOR", "Unidade", "Tipo de Contrato", "Data Nasc.", "Data Adm."],
    });

    const sheetName = workbook.SheetNames[0] || "Funcionarios";
    if (workbook.SheetNames.length > 0) {
      workbook.Sheets[sheetName] = newWorksheet;
    } else {
      XLSX.utils.book_append_sheet(workbook, newWorksheet, sheetName);
    }

    // CORREÇÃO: Usando o método de escrita de arquivo robusto para Node.js
    // 1. Gera o buffer do arquivo em memória
    const newFileBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

    // 2. Escreve o buffer no disco usando fs.writeFile
    await fs.writeFile(filePath, newFileBuffer);

    // Retorna o funcionário completo (com ID) para o frontend
    return NextResponse.json({ message: "Funcionário salvo com sucesso!", employee: employeeToSave }, { status: 200 });
  } catch (error: any) {
    console.error("Erro na API de cadastro:", error);
    return NextResponse.json({ message: "Erro interno do servidor: " + error.message }, { status: 500 });
  }
}