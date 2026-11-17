import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiWorkLocation } from "@/lib/api/attendance";
import type { GeofenceMapProps } from "@/components/geofence-picker/map";

/**
 * The work-location form with its map.
 *
 * jsdom cannot draw Leaflet, so the map is a stand-in with buttons for the four
 * things a real map tells the form: somebody clicked, somebody dragged the pin, the
 * tiles failed, the tiles came back. It also prints the pin and radius it was
 * handed, so "the map shows the right place" is an assertion. The address search,
 * the reverse lookup and the browser's location are mocks; nothing here reaches
 * the network.
 */

const stub = vi.hoisted(() => ({ props: null as GeofenceMapProps | null }));

vi.mock("next/dynamic", () => ({
  default: () =>
    function StubMap(props: GeofenceMapProps) {
      stub.props = props;
      return (
        <div data-testid="map">
          <span data-testid="map-pin">
            {props.pin
              ? `${props.pin.latitude},${props.pin.longitude}`
              : "none"}
          </span>
          <span data-testid="map-radius">{String(props.radiusMetres)}</span>
          <button
            type="button"
            onClick={() =>
              props.onPick({ latitude: 6.6, longitude: 3.35 }, "click")
            }
          >
            stub click
          </button>
          <button
            type="button"
            onClick={() =>
              props.onPick({ latitude: 6.61, longitude: 3.36 }, "drag")
            }
          >
            stub drag
          </button>
          <button type="button" onClick={() => props.onFailed()}>
            stub fail
          </button>
          <button type="button" onClick={() => props.onRecovered()}>
            stub recover
          </button>
        </div>
      );
    },
}));

const api = vi.hoisted(() => ({
  geocodeSearch: vi.fn(),
  geocodeReverse: vi.fn(),
}));

vi.mock("@/lib/api/attendance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/attendance")>();
  return {
    ...actual,
    attendanceApi: {
      ...actual.attendanceApi,
      geocodeSearch: api.geocodeSearch,
      geocodeReverse: api.geocodeReverse,
    },
  };
});

const geo = vi.hoisted(() => ({ readPosition: vi.fn() }));
vi.mock("@/lib/geolocation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/geolocation")>()),
  readPosition: geo.readPosition,
}));

const { LocationForm } =
  await import("@/app/(app)/settings/locations/location-form");

const ALLEN = {
  label: "Allen Avenue, Oregun, Ikeja, Lagos",
  latitude: 6.6014552,
  longitude: 3.3521317,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderForm(location?: ApiWorkLocation) {
  const onSave = vi.fn(async () => undefined);
  const user = userEvent.setup();
  const view = render(
    <LocationForm
      {...(location ? { location } : {})}
      open
      onClose={() => undefined}
      onSave={onSave}
    />,
  );
  return { onSave, user, view };
}

const fenceSwitch = () =>
  screen.getByRole("switch", { name: /check where the clock-in came from/i });
const searchBox = () =>
  screen.getByRole("combobox", { name: /search for the office address/i });
const addressBox = () => screen.getByLabelText(/^address/i);
const saveButton = (name: RegExp = /add location/i) =>
  screen.getByRole("button", { name });

const OFFICE: ApiWorkLocation = {
  id: "loc-1",
  name: "Head Office",
  addressLine: "No 15 Ade Nwonoro Street",
  remoteAllowed: false,
  latitude: 6.601838,
  longitude: 3.35089,
  radiusMetres: 150,
} as ApiWorkLocation;

beforeEach(() => {
  stub.props = null;
  api.geocodeSearch.mockReset();
  api.geocodeReverse.mockReset().mockResolvedValue(null);
  geo.readPosition.mockReset();
});

describe("placing the fence from a search", () => {
  it("puts the pin on the place, gives it 150 m, fills the empty address and saves the numbers", async () => {
    api.geocodeSearch.mockResolvedValue([ALLEN]);
    const { user, onSave } = renderForm();

    await user.type(screen.getByLabelText(/^name/i), "Ikeja branch");
    await user.click(fenceSwitch());
    await user.type(searchBox(), "Allen Avenue");
    await user.click(
      await screen.findByRole("option", { name: /allen avenue/i }),
    );

    expect(screen.getByTestId("map-pin")).toHaveTextContent(
      "6.601455,3.352132",
    );
    expect(screen.getByTestId("map-radius")).toHaveTextContent("150");
    expect(screen.getByRole("button", { name: "150 m" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(addressBox()).toHaveValue(ALLEN.label);
    expect(
      screen.getByText("Filled from the map. Edit if needed."),
    ).toBeInTheDocument();
    /* A search pick named the place already; no reverse lookup is asked for. */
    expect(api.geocodeReverse).not.toHaveBeenCalled();

    await user.click(saveButton());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Ikeja branch",
        addressLine: ALLEN.label,
        latitude: 6.601455,
        longitude: 3.352132,
        radiusMetres: 150,
      }),
    );
  });

  it("never overwrites an address somebody typed while the search was on its way", async () => {
    const slow = deferred<typeof ALLEN | null>();
    api.geocodeReverse.mockReturnValue(slow.promise);
    const { user } = renderForm();

    await user.click(fenceSwitch());
    await user.click(screen.getByRole("button", { name: "stub click" }));
    expect(api.geocodeReverse).toHaveBeenCalledTimes(1);

    await user.type(addressBox(), "12 Allen Ave");
    await act(async () => slow.resolve(ALLEN));

    expect(addressBox()).toHaveValue("12 Allen Ave");
  });

  it("shows only the newest search, however the older one is timed", async () => {
    const first = deferred<(typeof ALLEN)[]>();
    const second = deferred<(typeof ALLEN)[]>();
    api.geocodeSearch
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { user } = renderForm();

    await user.click(fenceSwitch());
    await user.type(searchBox(), "Ade");
    await waitFor(() => expect(api.geocodeSearch).toHaveBeenCalledTimes(1));
    await user.type(searchBox(), "ola Odeku");
    await waitFor(() => expect(api.geocodeSearch).toHaveBeenCalledTimes(2));

    await act(async () =>
      second.resolve([
        { ...ALLEN, label: "Adeola Odeku Street, Victoria Island, Lagos" },
      ]),
    );
    await act(async () =>
      first.resolve([{ ...ALLEN, label: "Ade Street, Lagos" }]),
    );

    expect(
      screen.getByRole("option", { name: /adeola odeku/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /^ade street/i }),
    ).not.toBeInTheDocument();
  });

  it("does not search just because the box was prefilled from the address", async () => {
    const { user } = renderForm(OFFICE);

    expect(searchBox()).toHaveValue(OFFICE.addressLine);
    await new Promise((r) => setTimeout(r, 400));
    expect(api.geocodeSearch).not.toHaveBeenCalled();

    api.geocodeSearch.mockResolvedValue([ALLEN]);
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(api.geocodeSearch).toHaveBeenCalledWith(
      OFFICE.addressLine,
      expect.any(AbortSignal),
    );
  });
});

describe("when the address search fails", () => {
  it.each([
    [503, /address search is turned off/i],
    [502, /isn't working right now/i],
    [404, /isn't working right now/i],
    [429, /search is busy/i],
  ])(
    "says so on a %s, and typed coordinates still save",
    async (status, message) => {
      api.geocodeSearch.mockRejectedValue(new ApiError(status, "x", "nope"));
      const { user, onSave } = renderForm();

      await user.type(screen.getByLabelText(/^name/i), "Ikeja branch");
      await user.click(fenceSwitch());
      await user.type(searchBox(), "Allen Avenue");
      expect(await screen.findByText(message)).toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: /enter coordinates by hand/i }),
      );
      await user.type(screen.getByLabelText(/^latitude/i), "6.601838");
      await user.type(screen.getByLabelText(/^longitude/i), "3.350890");
      await user.click(screen.getByRole("button", { name: "500 m" }));
      await user.click(saveButton());

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: 6.601838,
          longitude: 3.35089,
          radiusMetres: 500,
        }),
      );
    },
  );
});

describe("when the map cannot load", () => {
  it("says so and opens the typed fields; a late tile clears the message but leaves them open", async () => {
    const { user } = renderForm();
    await user.click(fenceSwitch());
    expect(screen.queryByLabelText(/^latitude/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "stub fail" }));
    expect(screen.getByText("Map couldn't load")).toBeInTheDocument();
    expect(screen.getByLabelText(/^latitude/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "stub recover" }));
    expect(screen.queryByText("Map couldn't load")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^latitude/i)).toBeInTheDocument();
  });
});

describe("what Save allows", () => {
  it("stays off with the fence on and no pin, and says what is missing", async () => {
    const { user } = renderForm();
    await user.type(screen.getByLabelText(/^name/i), "Ikeja branch");
    await user.click(fenceSwitch());

    expect(saveButton()).toBeDisabled();
    expect(
      screen.getByText("Place the pin on the map or enter the coordinates."),
    ).toBeInTheDocument();
  });

  it("stays off with a radius out of range", async () => {
    const { user } = renderForm();
    await user.type(screen.getByLabelText(/^name/i), "Ikeja branch");
    await user.click(fenceSwitch());
    await user.click(screen.getByRole("button", { name: "stub click" }));
    expect(saveButton()).toBeEnabled();

    const radius = screen.getByLabelText(/radius, in metres/i);
    await user.clear(radius);
    await user.type(radius, "5");
    expect(saveButton()).toBeDisabled();
    expect(screen.getByTestId("map-radius")).toHaveTextContent("null");
  });
});

describe("editing a fence that is already set", () => {
  it("warns when the pin leaves the old circle", async () => {
    const { user } = renderForm(OFFICE);
    expect(stub.props?.saved).toEqual({
      latitude: 6.601838,
      longitude: 3.35089,
      radiusMetres: 150,
    });
    expect(screen.queryByText("The fence has moved")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "stub drag" }));
    expect(screen.getByText("The fence has moved")).toBeInTheDocument();
  });

  it("says switching it off removes it, and saves nulls", async () => {
    const { user, onSave } = renderForm(OFFICE);
    await user.click(fenceSwitch());

    expect(
      screen.getByText("Saving removes this location's fence"),
    ).toBeInTheDocument();
    await user.click(saveButton(/^save$/i));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: null,
        longitude: null,
        radiusMetres: null,
      }),
    );
  });

  it("opens with the typed fields showing the saved numbers", () => {
    renderForm(OFFICE);
    expect(screen.getByLabelText(/^latitude/i)).toHaveValue("6.601838");
  });
});

describe("clicking the map when a pin is already there", () => {
  it("moves the pin and offers to put it back", async () => {
    const { user } = renderForm(OFFICE);
    await user.click(screen.getByRole("button", { name: "stub click" }));
    expect(screen.getByTestId("map-pin")).toHaveTextContent("6.6,3.35");

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("map-pin")).toHaveTextContent("6.601838,3.35089");
  });
});

describe("using my current location", () => {
  it("places the pin, says how accurate it is, and warns when that is wider than the fence", async () => {
    geo.readPosition.mockResolvedValue({
      latitude: 6.6,
      longitude: 3.35,
      accuracyMetres: 420,
    });
    const { user } = renderForm();
    await user.click(fenceSwitch());
    await user.click(
      screen.getByRole("button", { name: /use my current location/i }),
    );

    expect(
      await screen.findByText("Accurate to about 420 m."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("map-pin")).toHaveTextContent("6.6,3.35");
    expect(screen.getByText(/wider than the fence/i)).toBeInTheDocument();
  });

  it("ignores a position that arrives after the form has closed", async () => {
    const late = deferred<{
      latitude: number;
      longitude: number;
      accuracyMetres: number;
    }>();
    geo.readPosition.mockReturnValue(late.promise);
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { user, view } = renderForm();
    await user.click(fenceSwitch());
    await user.click(
      screen.getByRole("button", { name: /use my current location/i }),
    );

    view.unmount();
    await act(async () =>
      late.resolve({ latitude: 6.6, longitude: 3.35, accuracyMetres: 20 }),
    );

    expect(api.geocodeReverse).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe("a dialog that stays mounted while closed", () => {
  /* The screen keeps both forms mounted so the Modal can animate out. The edit form
     first renders with no location, then is opened on one: it must show that
     location, not the empty draft it started with (a regression on dev since
     0420bf84, where every Edit opened blank). */
  it("shows the location it is opened on, and starts fresh on the next one", () => {
    const onSave = vi.fn(async () => undefined);
    const view = render(
      <LocationForm open={false} onClose={() => undefined} onSave={onSave} />,
    );
    view.rerender(
      <LocationForm
        open
        location={OFFICE}
        onClose={() => undefined}
        onSave={onSave}
      />,
    );
    expect(screen.getByLabelText(/^name/i)).toHaveValue("Head Office");
    expect(addressBox()).toHaveValue(OFFICE.addressLine);
    expect(fenceSwitch()).toBeChecked();
    expect(screen.getByLabelText(/^latitude/i)).toHaveValue("6.601838");

    const other = {
      ...OFFICE,
      id: "loc-2",
      name: "Remote",
      addressLine: "Anywhere",
      latitude: null,
      longitude: null,
      radiusMetres: null,
    } as unknown as ApiWorkLocation;
    view.rerender(
      <LocationForm
        open={false}
        location={other}
        onClose={() => undefined}
        onSave={onSave}
      />,
    );
    view.rerender(
      <LocationForm
        open
        location={other}
        onClose={() => undefined}
        onSave={onSave}
      />,
    );
    expect(screen.getByLabelText(/^name/i)).toHaveValue("Remote");
    expect(fenceSwitch()).not.toBeChecked();
  });
});
