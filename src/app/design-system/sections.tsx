"use client";

import { useState } from "react";
import {
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  Download,
  FileText,
  Inbox,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import {
  Accordion,
  AreaChart,
  Avatar,
  Badge,
  BarChart,
  Button,
  Callout,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  DescriptionList,
  DonutChart,
  Drawer,
  DrawerSection,
  EmptyState,
  Field,
  FieldSet,
  FunnelChart,
  IconButton,
  Input,
  Modal,
  Money,
  ProgressMeter,
  Radio,
  RadioCard,
  ScoreRing,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonText,
  Sparkline,
  Spinner,
  Stat,
  StepIndicator,
  Switch,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  Tabs,
  Tag,
  Textarea,
  Timeline,
  useToast,
} from "@/components/ui";

/* -------------------------------------------------------------------------- */

export function ButtonsDemo() {
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <Row label="Variants">
        <Button variant="primary">Primary</Button>
        <Button variant="accent">Accent</Button>
        <Button variant="approve">Approve</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Delete</Button>
      </Row>

      <Row label="Sizes">
        <Button size="sm" variant="secondary">
          Small
        </Button>
        <Button size="md" variant="secondary">
          Medium
        </Button>
        <Button size="lg" variant="secondary">
          Large
        </Button>
      </Row>

      <Row label="With icons">
        <Button variant="accent">
          <Plus aria-hidden="true" className="size-4" />
          New requisition
        </Button>
        <Button variant="secondary">
          <Download aria-hidden="true" className="size-4" />
          Export
        </Button>
        <IconButton label="Search" variant="secondary">
          <Search aria-hidden="true" className="size-4" />
        </IconButton>
        <IconButton label="Delete" variant="ghost">
          <Trash2 aria-hidden="true" className="size-4" />
        </IconButton>
      </Row>

      <Row label="States">
        <Button variant="accent" disabled>
          Disabled
        </Button>
        <Button
          variant="accent"
          loading={loading}
          onClick={() => {
            setLoading(true);
            setTimeout(() => setLoading(false), 1800);
          }}
        >
          {loading ? "Running payroll" : "Click to load"}
        </Button>
      </Row>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2.5 text-meta font-medium tracking-wide text-muted">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-2.5">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function FormsDemo() {
  const [role, setRole] = useState("full-time");
  const [notify, setNotify] = useState(true);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-5">
        <Field label="Full name" required help="As it appears on their ID.">
          <Input placeholder="Example Alpha" />
        </Field>

        <Field
          label="Work email"
          required
          error="That email is already in use by another employee."
        >
          <Input type="email" defaultValue="a.okonkwo@company.com" />
        </Field>

        <Field label="Department" required>
          <Select placeholder="Select a department">
            <option value="eng">Engineering</option>
            <option value="fin">Finance</option>
            <option value="ops">Operations</option>
            <option value="people">People &amp; Culture</option>
          </Select>
        </Field>

        <Field
          label="Gross monthly salary"
          required
          help="Before PAYE and pension deductions."
        >
          <Input type="text" inputMode="numeric" defaultValue="₦850,000" />
        </Field>

        <Field label="Notes" help="Visible to HR admins only.">
          <Textarea
            rows={3}
            placeholder="Anything the approving manager should know…"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-5">
        <FieldSet legend="Employment type">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <RadioCard
              name="role"
              value="full-time"
              checked={role === "full-time"}
              onChange={() => setRole("full-time")}
              label="Full time"
              description="Pension and PAYE apply"
            />
            <RadioCard
              name="role"
              value="contract"
              checked={role === "contract"}
              onChange={() => setRole("contract")}
              label="Contract"
              description="WHT applies instead"
            />
          </div>
        </FieldSet>

        <FieldSet legend="Access" help="What this person can reach on day one.">
          <div className="flex flex-col gap-3">
            <Checkbox
              label="Payroll"
              description="View and run payroll cycles"
              defaultChecked
            />
            <Checkbox
              label="Hiring"
              description="Manage requisitions and candidates"
            />
            <Checkbox label="Reports" description="Export company-wide data" />
          </div>
        </FieldSet>

        <FieldSet legend="Preferences">
          <div className="flex flex-col gap-4">
            <Switch
              label="Email notifications"
              description="Approvals, payslips and reminders"
              checked={notify}
              onChange={(e) => setNotify(e.currentTarget.checked)}
            />
            <Switch
              label="Two-factor authentication"
              description="Required for anyone with payroll access"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.currentTarget.checked)}
            />
          </div>
        </FieldSet>

        <FieldSet legend="Pay frequency">
          <div className="flex flex-col gap-2.5">
            <Radio name="freq" label="Monthly" defaultChecked />
            <Radio name="freq" label="Bi-weekly" />
            <Radio name="freq" label="Weekly" />
          </div>
        </FieldSet>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const EMPLOYEES = [
  { id: "1", name: "Example Alpha", role: "Senior Engineer", dept: "Engineering", salary: 1_250_000, status: "active" as const },
  { id: "2", name: "Example Bravo", role: "Finance Manager", dept: "Finance", salary: 980_000, status: "active" as const },
  { id: "3", name: "Example Charlie", role: "Product Designer", dept: "Product", salary: 870_000, status: "leave" as const },
  { id: "4", name: "Example Delta", role: "Operations Lead", dept: "Operations", salary: 760_000, status: "probation" as const },
  { id: "5", name: "Example Echo", role: "People Partner", dept: "People", salary: 690_000, status: "offboarding" as const },
];

const STATUS_MAP = {
  active: { tone: "success" as const, label: "Active" },
  leave: { tone: "info" as const, label: "On leave" },
  probation: { tone: "warning" as const, label: "Probation" },
  offboarding: { tone: "danger" as const, label: "Offboarding" },
};

export function TableDemo() {
  return (
    <TableWrap caption="Employee directory with role, department, salary and status">
      <THead>
        <TH>Employee</TH>
        <TH>Department</TH>
        <TH align="right">Gross monthly</TH>
        <TH>Status</TH>
        <TH align="right">Actions</TH>
      </THead>
      <TBody>
        {EMPLOYEES.map((e) => (
          <TR key={e.id} interactive>
            <TDPrimary title={e.name} subtitle={e.role} />
            <TD>
              <Tag>{e.dept}</Tag>
            </TD>
            <TD align="right" className="tabular font-medium text-ink">
              <Money amount={e.salary} />
            </TD>
            <TD>
              <Badge tone={STATUS_MAP[e.status].tone} dot>
                {STATUS_MAP[e.status].label}
              </Badge>
            </TD>
            <TD align="right">
              <Button size="sm" variant="ghost">
                View
              </Button>
            </TD>
          </TR>
        ))}
      </TBody>
    </TableWrap>
  );
}

/* -------------------------------------------------------------------------- */

export function ChartsDemo() {
  const headcount = [
    { label: "Feb", value: 182 },
    { label: "Mar", value: 191 },
    { label: "Apr", value: 205 },
    { label: "May", value: 213 },
    { label: "Jun", value: 228 },
    { label: "Jul", value: 241 },
    { label: "Aug", value: 264 },
  ];

  const byDept = [
    { label: "Engineering", value: 86 },
    { label: "Operations", value: 54 },
    { label: "Sales", value: 41 },
    { label: "Finance", value: 28 },
    { label: "People", value: 19 },
  ];

  const payrollSplit = [
    { label: "Net pay", value: 68_400_000 },
    { label: "PAYE", value: 14_200_000 },
    { label: "Pension", value: 8_100_000 },
    { label: "NHF", value: 2_300_000 },
  ];

  const pipeline = [
    { label: "Sourced", value: 340 },
    { label: "Shortlisted", value: 128 },
    { label: "Pre-screened", value: 74 },
    { label: "Interviewed", value: 31 },
    { label: "Offered", value: 9 },
    { label: "Hired", value: 6 },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Headcount" description="Rolling seven months" />
        <CardBody>
          <AreaChart
            points={headcount}
            caption="Headcount by month, February to August"
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Headcount by department" />
        <CardBody>
          <BarChart
            points={byDept}
            caption="Headcount by department"
            colorBy="series"
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="August payroll"
          description="Where the gross went"
        />
        <CardBody>
          <DonutChart
            points={payrollSplit}
            caption="August payroll split by component"
            centreLabel="Gross ₦93.0m"
            format={(n) => `₦${(n / 1_000_000).toFixed(1)}m`}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Hiring funnel"
          description="All open roles, last 90 days"
        />
        <CardBody>
          <FunnelChart
            stages={pipeline}
            caption="Candidate funnel across six hiring stages"
          />
        </CardBody>
      </Card>
    </div>
  );
}

export function StatsDemo() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Headcount"
        value="264"
        icon={<Users aria-hidden="true" />}
        trend={{ direction: "up", label: "+23" }}
        hint="vs last month"
      />
      <Stat
        label="August payroll"
        value={<Money amount={93_000_000} compact />}
        icon={<FileText aria-hidden="true" />}
        trend={{ direction: "up", label: "+4.1%" }}
        hint="vs July"
      />
      <Stat
        label="Open roles"
        value="12"
        icon={<Briefcase aria-hidden="true" />}
        trend={{ direction: "flat", label: "No change" }}
      />
      <Stat
        label="Avg. time to hire"
        value="31 days"
        icon={<CalendarDays aria-hidden="true" />}
        trend={{ direction: "down", label: "−6 days" }}
        hint="faster than Q2"
      />
    </div>
  );
}

export function SparklineDemo() {
  return (
    <div className="flex flex-wrap items-center gap-8">
      <div className="flex items-center gap-3">
        <Sparkline values={[12, 18, 14, 22, 26, 24, 31]} />
        <span className="text-body-sm text-muted">accent</span>
      </div>
      <div className="flex items-center gap-3">
        <Sparkline values={[31, 28, 30, 22, 19, 16, 11]} tone="success" />
        <span className="text-body-sm text-muted">success</span>
      </div>
      <div className="flex items-center gap-3">
        <Sparkline values={[8, 12, 9, 17, 14, 26, 34]} tone="danger" />
        <span className="text-body-sm text-muted">danger</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function FeedbackDemo() {
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [longDrawer, setLongDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();

  return (
    <div className="flex flex-col gap-6">
      <Row label="Callouts">
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <Callout tone="accent" title="Pending your approval">
            Three leave requests need a decision before Friday.
          </Callout>
          <Callout tone="success" title="Payroll approved">
            August payroll was approved by Example Bravo and is queued to pay on
            28 Aug.
          </Callout>
          <Callout tone="warning" title="Pension remittance due">
            Your PenCom remittance for July is due in 3 days.
          </Callout>
          <Callout tone="danger" title="4 bank accounts failed validation">
            These employees will not be paid until their details are corrected.
          </Callout>
        </div>
      </Row>

      <Row label="Overlays and toasts">
        <Button variant="secondary" onClick={() => setModal(true)}>
          Open modal
        </Button>
        {/* Two of them, because the footer is the interesting part and it only
            behaves differently once the content overflows. Open both. */}
        <Button variant="secondary" onClick={() => setDrawer(true)}>
          Drawer, short
        </Button>
        <Button variant="secondary" onClick={() => setLongDrawer(true)}>
          Drawer, scrolling
        </Button>
        <Button variant="secondary" onClick={() => setConfirm(true)}>
          Confirm dialog
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast.push({
              title: "Payroll approved",
              tone: "success",
              detail: "264 employees · ₦93,000,000 · pays 28 Aug",
            })
          }
        >
          Fire toast
        </Button>
      </Row>

      <Row label="Loading and empty">
        <div className="grid w-full gap-4 sm:grid-cols-3">
          <Card>
            <CardBody className="flex flex-col gap-3">
              <Skeleton className="h-4 w-2/3" />
              <SkeletonText lines={3} />
            </CardBody>
          </Card>
          <Card>
            <CardBody className="flex items-center justify-center py-10">
              <Spinner label="Loading payroll" />
            </CardBody>
          </Card>
          <Card>
            <EmptyState
              compact
              icon={<Inbox aria-hidden="true" />}
              title="No pending approvals"
              description="Everything routed to you has been actioned."
              action={
                <Button size="sm" variant="secondary">
                  View history
                </Button>
              }
            />
          </Card>
        </div>
      </Row>

      <Row label="Progress">
        <div className="grid w-full gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex flex-col gap-4">
            <ProgressMeter value={82} label="Onboarding complete" showValue />
            <ProgressMeter
              value={45}
              label="Documents verified"
              tone="warning"
              showValue
            />
            <ProgressMeter
              value={100}
              label="Payroll approved"
              tone="success"
              showValue
            />
          </div>
          <ScoreRing score={78} label="Fit" caption="Candidate score" />
        </div>
      </Row>

      <Modal open={modal} onClose={() => setModal(false)} title="Approve payroll">
        <p className="text-body-sm leading-relaxed text-body">
          You are approving August payroll for 264 employees, totalling{" "}
          <Money amount={93_000_000} className="font-medium text-ink" />. Funds
          leave the account on 28 August.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setModal(false)}>
            Cancel
          </Button>
          <Button variant="approve" onClick={() => setModal(false)}>
            <Check aria-hidden="true" className="size-4" />
            Approve payroll
          </Button>
        </div>
      </Modal>

      {/*
       * Short content. The panel is only as tall as what is in it and the footer
       * sits under the last fact, rather than being thrown to the bottom of the
       * viewport with an inch of white above it.
       */}
      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Example Alpha"
        description="Senior Engineer · Engineering"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDrawer(false)}>
              Close
            </Button>
            <Button variant="accent" onClick={() => setDrawer(false)}>
              Open the record
            </Button>
          </>
        }
      >
        <DescriptionList
          layout="rows"
          items={[
            { term: "Employee ID", value: "AHR-0142" },
            { term: "Start date", value: "12 March 2024" },
            { term: "Manager", value: "Example Bravo" },
            { term: "Gross monthly", value: <Money amount={1_250_000} /> },
            { term: "Pension PIN", value: "PEN000000000" },
            { term: "Status", value: <Badge tone="success" dot>Active</Badge> },
          ]}
        />
      </Drawer>

      {/*
       * The same panel with more in it than fits. The body becomes the scroller
       * and the footer comes to rest on the bottom edge — same component, same
       * markup, no branch.
       */}
      <Drawer
        open={longDrawer}
        onClose={() => setLongDrawer(false)}
        title="Example Alpha"
        description="Everything on file"
        size="lg"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <p className="text-body-sm text-muted">Last edited 2 days ago</p>
            <Button variant="accent" onClick={() => setLongDrawer(false)}>
              Save changes
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          {["Employment", "Pay", "Statutory", "Documents", "Equipment", "Leave"].map(
            (section) => (
              <DrawerSection key={section} title={section}>
                <DescriptionList
                  layout="rows"
                  items={[
                    { term: "Reference", value: "AHR-0142" },
                    { term: "Recorded", value: "12 March 2024" },
                    { term: "Recorded by", value: "Example Bravo" },
                    { term: "Value", value: <Money amount={1_250_000} /> },
                  ]}
                />
              </DrawerSection>
            ),
          )}
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          toast.push({ title: "Requisition deleted", tone: "success" });
        }}
        title="Delete this requisition?"
        body="The 14 candidates already in this pipeline will be archived. This cannot be undone."
        confirmLabel="Delete requisition"
        tone="danger"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function NavigationDemo() {
  const [tab, setTab] = useState("overview");
  const [view, setView] = useState<"table" | "board">("table");

  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="mb-2.5 text-meta font-medium tracking-wide text-muted">
          Tabs
        </p>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: "overview", label: "Overview" },
            { id: "candidates", label: "Candidates", count: 128 },
            { id: "interviews", label: "Interviews", count: 12 },
            { id: "offers", label: "Offers", count: 3 },
          ]}
        />
        <div className="mt-4 rounded-lg border border-line bg-canvas px-4 py-6 text-center text-body-sm text-muted">
          Panel for <span className="font-medium text-ink">{tab}</span>
        </div>
      </div>

      <div>
        <p className="mb-2.5 text-meta font-medium tracking-wide text-muted">
          Segmented control
        </p>
        <SegmentedControl
          label="View mode"
          value={view}
          onChange={setView}
          options={[
            { value: "table", label: "Table" },
            { value: "board", label: "Board" },
          ]}
        />
      </div>

      <div>
        <p className="mb-2.5 text-meta font-medium tracking-wide text-muted">
          Stepper
        </p>
        <StepIndicator
          index={2}
          furthest={3}
          steps={[
            { id: "role", label: "Role details" },
            { id: "pay", label: "Compensation" },
            { id: "pipeline", label: "Hiring stages" },
            { id: "team", label: "Interview team", optional: true },
            { id: "review", label: "Review" },
          ]}
        />
      </div>

      <div>
        <p className="mb-2.5 text-meta font-medium tracking-wide text-muted">
          Accordion
        </p>
        <Accordion
          items={[
            {
              id: "1",
              question: "How is PAYE calculated?",
              answer:
                "PAYE follows the progressive bands in the Finance Act, applied after pension and NHF relief. The bands are configurable per company.",
            },
            {
              id: "2",
              question: "Can an approval be reversed?",
              answer:
                "Until the payment file is generated. After that the cycle must be voided and re-run, which is recorded in the audit log.",
            },
          ]}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function PeopleDemo() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <div>
          <p className="mb-2.5 text-meta font-medium tracking-wide text-muted">
            Avatars
          </p>
          <div className="flex items-center gap-3">
            <Avatar name="Example Alpha" size="xs" />
            <Avatar name="Example Bravo" size="sm" />
            <Avatar name="Example Charlie" size="md" tone="accent" />
            <Avatar name="Example Delta" size="lg" tone="ink" />
          </div>
        </div>

        <div>
          <p className="mb-2.5 text-meta font-medium tracking-wide text-muted">
            Badges
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral" dot>Draft</Badge>
            <Badge tone="warning" dot>Pending</Badge>
            <Badge tone="info" dot>In review</Badge>
            <Badge tone="success" dot>Approved</Badge>
            <Badge tone="danger" dot>Rejected</Badge>
            <Badge tone="accent" dot>Scheduled</Badge>
            <Badge tone="ink">Enterprise</Badge>
          </div>
        </div>

        <div>
          <p className="mb-2.5 text-meta font-medium tracking-wide text-muted">
            Description list
          </p>
          <Card>
            <CardBody>
              <DescriptionList
                columns={2}
                items={[
                  { term: "Employee ID", value: "AHR-0142" },
                  { term: "Department", value: "Engineering" },
                  { term: "Start date", value: "12 Mar 2024" },
                  { term: "Manager", value: "Example Bravo" },
                  { term: "Location", value: "Lagos, NG" },
                  { term: "Type", value: "Full time" },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>

      <div>
        <p className="mb-2.5 text-meta font-medium tracking-wide text-muted">
          Timeline
        </p>
        <Card>
          <CardBody>
            <Timeline
              entries={[
                {
                  id: "1",
                  title: "Offer accepted",
                  detail: "Signed via e-signature",
                  timestamp: "Today, 09:12",
                  actor: "Example Alpha",
                  tone: "success",
                },
                {
                  id: "2",
                  title: "Offer sent",
                  detail: "₦1,250,000 gross monthly",
                  timestamp: "Yesterday, 16:40",
                  actor: "Example Echo",
                  tone: "accent",
                },
                {
                  id: "3",
                  title: "Final interview completed",
                  detail: "Scorecard average 4.6 / 5",
                  timestamp: "22 Aug, 11:00",
                  actor: "Example Bravo",
                },
                {
                  id: "4",
                  title: "Application received",
                  timestamp: "14 Aug, 08:30",
                  actor: "Careers page",
                },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function CardsDemo() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader
          title="Basic card"
          description="Header, body and footer"
        />
        <CardBody>
          <p className="text-body-sm leading-relaxed text-body">
            The default surface for grouped content. Hairline border, no shadow
            at rest.
          </p>
        </CardBody>
        <CardFooter>
          <Button size="sm" variant="ghost">
            Cancel
          </Button>
          <Button size="sm" variant="accent">
            Save
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader
          title="With action"
          description="Header carries a trailing control"
          action={
            <IconButton label="Company settings" variant="ghost" size="sm">
              <Building2 aria-hidden="true" className="size-4" />
            </IconButton>
          }
        />
        <CardBody>
          <DescriptionList
            columns={1}
            items={[
              { term: "Entity", value: "Schull Technologies Ltd" },
              { term: "RC number", value: "RC-1482930" },
              { term: "Employees", value: "264" },
            ]}
          />
        </CardBody>
      </Card>

      <Card className="brand-wash">
        <CardBody className="py-8 text-center">
          <p className="text-h4 text-ink">Brand wash</p>
          <p className="mt-1.5 text-body-sm text-body">
            Indigo and green radial tint. For onboarding and empty moments only.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
