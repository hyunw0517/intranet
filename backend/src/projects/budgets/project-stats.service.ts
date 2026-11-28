import { Injectable } from "@nestjs/common";
import { Prisma } from "src/generated/prisma/client";
import { kstDateString } from "src/common/util/date.util";
import { PrismaService } from "src/prisma/prisma.service";
import { fillMonths, monthRange, recentMonths, summarizeCategories, yearMonths } from "./budget-rules.util";
import { ProjectStatsQueryDto } from "./dto/project-budget.dto";

const TOP_CLIENTS = 10;

//! 전사 통계 (과제 관리 관리자)
// - 기간은 기본 최근 12개월, 연도를 고르면 그해 1~12월. 삭제된 프로젝트는 뺀다.
// - 매출은 청구한 건의 합계(부가세 포함, 청구일 기준), 지출은 공급가액(지출일 기준).
// - 항목별 예산 대비 지출은 기간과 상관없는 누적이다. 예산에 연도가 없어서 한 해만 자르면 숫자가 맞지 않는다.
// - 달로 묶는 집계는 Prisma groupBy로 안 돼서 SQL로 한다.
@Injectable()
export class ProjectStatsService {

    constructor(
        private readonly prisma: PrismaService,
    ){}

    async company( query: ProjectStatsQueryDto ) {
        const { year, projectId, clientId } = query;
        const months = year ? yearMonths( year ) : recentMonths( kstDateString( new Date() ) );
        const { from, to } = monthRange( months );

        // 프로젝트 조건 (별칭 p): 삭제 제외 + 고른 프로젝트·거래처
        const scope = Prisma.sql`p.deleted = false
            ${projectId ? Prisma.sql`AND p.id = ${projectId}` : Prisma.empty}
            ${clientId ? Prisma.sql`AND p.client_id = ${clientId}` : Prisma.empty}`;
        const projectWhere = { deleted: false, id: projectId, clientId } satisfies Prisma.ProjectWhereInput;

        const [ sales, expenses, clients, budgets, spent ] = await Promise.all([
            this.prisma.$queryRaw<{ month: string; amount: Prisma.Decimal }[]>`
                SELECT to_char( s.billed_date, 'YYYY-MM' ) AS month, SUM( s.total_amount ) AS amount
                FROM project_sale_model s
                JOIN project_model p ON p.id = s.project_id
                WHERE ${scope} AND s.deleted = false AND s.status = 'BILLED'::"ProjectSaleStatus"
                    AND s.billed_date >= ${from}::date AND s.billed_date < ${to}::date
                GROUP BY 1`,
            this.prisma.$queryRaw<{ month: string; amount: Prisma.Decimal }[]>`
                SELECT to_char( e.expense_date, 'YYYY-MM' ) AS month, SUM( e.supply_amount ) AS amount
                FROM project_expense_model e
                JOIN project_model p ON p.id = e.project_id
                WHERE ${scope} AND e.deleted = false
                    AND e.expense_date >= ${from}::date AND e.expense_date < ${to}::date
                GROUP BY 1`,
            // 거래처별 매출 순위 (발주처가 없는 프로젝트는 뺀다, 삭제된 거래처도 이름은 남는다)
            this.prisma.$queryRaw<{ id: number; name: string; amount: Prisma.Decimal }[]>`
                SELECT c.id, c.name, SUM( s.total_amount ) AS amount
                FROM project_sale_model s
                JOIN project_model p ON p.id = s.project_id
                JOIN project_client_model c ON c.id = p.client_id
                WHERE ${scope} AND s.deleted = false AND s.status = 'BILLED'::"ProjectSaleStatus"
                    AND s.billed_date >= ${from}::date AND s.billed_date < ${to}::date
                GROUP BY c.id, c.name
                ORDER BY amount DESC, c.id ASC
                LIMIT ${TOP_CLIENTS}`,
            this.prisma.projectBudget.findMany({
                where: { project: projectWhere },
                select: { amount: true, category: { select: { id: true, name: true, deleted: true } } },
            }),
            this.prisma.projectExpense.findMany({
                where: { deleted: false, project: projectWhere },
                select: { supplyAmount: true, category: { select: { id: true, name: true, deleted: true } } },
            }),
        ]);

        return {
            monthlySales: fillMonths( months, sales ),
            monthlyExpenses: fillMonths( months, expenses ),
            topClients: clients.map( ( c ) => ({ clientId: c.id, name: c.name, amount: c.amount }) ),
            categories: summarizeCategories( budgets, spent ),
        };
    }

    //* 필터 선택지 (데이터가 있는 연도·삭제되지 않은 프로젝트·그 발주처)
    async filters() {
        const [ rows, projects, clients ] = await Promise.all([
            this.prisma.$queryRaw<{ year: number }[]>`
                SELECT EXTRACT( YEAR FROM s.billed_date )::int AS year
                FROM project_sale_model s
                JOIN project_model p ON p.id = s.project_id AND p.deleted = false
                WHERE s.deleted = false AND s.status = 'BILLED'::"ProjectSaleStatus" AND s.billed_date IS NOT NULL
                UNION
                SELECT EXTRACT( YEAR FROM e.expense_date )::int AS year
                FROM project_expense_model e
                JOIN project_model p ON p.id = e.project_id AND p.deleted = false
                WHERE e.deleted = false`,
            this.prisma.project.findMany({
                where: { deleted: false },
                select: { id: true, name: true, clientId: true },
                orderBy: [ { name: 'asc' }, { id: 'asc' } ],
            }),
            this.prisma.projectClient.findMany({
                where: { projects: { some: { deleted: false } } },
                select: { id: true, name: true, deleted: true },
                orderBy: [ { name: 'asc' }, { id: 'asc' } ],
            }),
        ]);

        const thisYear = Number( kstDateString( new Date() ).slice( 0, 4 ) );
        const years = [ ...new Set( [ thisYear, ...rows.map( ( r ) => r.year ) ] ) ].sort( ( a, b ) => b - a );
        return { years, projects, clients };
    }
}
