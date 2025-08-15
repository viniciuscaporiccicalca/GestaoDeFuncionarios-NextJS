import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import * as XLSX from "xlsx";

// Função auxiliar para converter datas (reutilizada do cadastro)
function dateToExcelSerial(dateString: string): number | null {
  if (!dateString) return null;
  const date = new Date(dateString + "T12:00:00Z");
  if (isNaN(date.getTime())) return null;
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  return (date.getTime() - excelEpoch.getTime()) / (24 * 60 * 60 * 1000);
}

// Função para garantir que o arquivo exista e lê-lo
async function readEmployeesFile() {
  const filePath = path.join(process.cwd(), "public", "funcionarios.xlsx");
  try {
    const fileBuffer = await fs.readFile(filePath);
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);
    return { data, workbook, filePath };
  } catch (error) {
    throw new Error("Arquivo funcionarios.xlsx não encontrado.");
  }
}

// Função para salvar as alterações no arquivo
async function writeEmployeesFile(filePath: string, workbook: XLSX.WorkBook, data: any[]) {
  const sheetName = workbook.SheetNames[0];
  const newWorksheet = XLSX.utils.json_to_sheet(data);
  workbook.Sheets[sheetName] = newWorksheet;

  const newFileBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  await fs.writeFile(filePath, newFileBuffer);
}

// --- Lógica da API ---

// EDITAR um funcionário
export async function PUT(request: NextRequest) {
  try {
    const employeeToUpdate = await request.json();
    if (!employeeToUpdate || !employeeToUpdate.ID) {
      return NextResponse.json({ message: "Dados ou ID do funcionário ausentes." }, { status: 400 });
    }

    const { data, workbook, filePath } = await readEmployeesFile();

    let employeeFound = false;
    const updatedData = data.map(emp => {
      if (emp.ID === employeeToUpdate.ID) {
        employeeFound = true;
        // Converte as datas de string (do formulário) para serial do Excel antes de salvar
        return {
          ...emp, // Mantém campos não editados como Faixa Etária, etc.
          ...employeeToUpdate,
          "Data Nasc.": dateToExcelSerial(employeeToUpdate["Data Nasc."]),
          "Data Adm.": dateToExcelSerial(employeeToUpdate["Data Adm."]),
        };
      }
      return emp;
    });

    if (!employeeFound) {
      return NextResponse.json({ message: "Funcionário não encontrado." }, { status: 404 });
    }

    await writeEmployeesFile(filePath, workbook, updatedData);

    return NextResponse.json({ message: "Funcionário atualizado com sucesso!" }, { status: 200 });
  } catch (error: any) {
    console.error("Erro na API (PUT):", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

// EXCLUIR um funcionário
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idToDelete = searchParams.get("id");

    if (!idToDelete) {
      return NextResponse.json({ message: "ID do funcionário não fornecido." }, { status: 400 });
    }

    const numericId = parseInt(idToDelete, 10);
    const { data, workbook, filePath } = await readEmployeesFile();

    const initialLength = data.length;
    const updatedData = data.filter(emp => emp.ID !== numericId);

    if (updatedData.length === initialLength) {
      return NextResponse.json({ message: "Funcionário não encontrado para exclusão." }, { status: 404 });
    }

    await writeEmployeesFile(filePath, workbook, updatedData);

    return NextResponse.json({ message: "Funcionário excluído com sucesso!" }, { status: 200 });
  } catch (error: any) {
    console.error("Erro na API (DELETE):", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}