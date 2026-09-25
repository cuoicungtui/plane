import { ThemeColorMode } from "@plait/core";
import type { PlaitBoard, PlaitTheme, Viewport } from "@plait/core";
import { useCallback, useMemo, useRef } from "react";
import type { CSSProperties, PointerEvent, ReactElement } from "react";
import { Board, Wrapper } from "./react-board";
import type { WhiteboardImages } from "./images";
import { guardNativeKeyDefaults } from "./native-key-guard";
import { DEFAULT_WHITEBOARD_LABELS, createWhiteboardOptions, createWhiteboardPlugins } from "./plugins";
import type { WhiteboardLabels } from "./plugins";
import { sceneFromBoard } from "./scene";
import type { WhiteboardScene } from "./scene";
import { whiteboardToolFromBoard } from "./tools";
import type { WhiteboardTool } from "./tools";

export type WhiteboardCanvasProps = {
  /**
   * The scene the board starts from. It is read once: the canvas owns the live
   * state afterwards, so later changes to this prop are ignored.
   */
  initialScene: WhiteboardScene;
  /** Toggling this remounts the board, keeping the current (unsaved) content. */
  readOnly?: boolean;
  /**
   * Called after the element tree or the colour mode changes. Selection,
   * scrolling and zooming alone do not fire it; the current zoom is included in
   * the next scene that does.
   */
  onSceneChange?: (scene: WhiteboardScene) => void;
  /** Called once per mounted board, with the live Plait board (for toolbars and export). */
  onReady?: (board: PlaitBoard) => void;
  /**
   * Called with the active tool after every board change and once per mounted board.
   * Plait returns to the selection tool by itself after an element has been placed,
   * and changing the tool notifies nobody, so the same tool is often reported
   * repeatedly; ignore repeats (React state does).
   */
  onToolChange?: (tool: WhiteboardTool) => void;
  /**
   * Called after every Plait change, selection, zoom and scroll included, with the live board.
   * A toolbar reads what it shows (selection, zoom, undo state) from it; compare with the last value
   * you kept and skip repeats, because this fires often.
   */
  onChange?: (board: PlaitBoard) => void;
  /**
   * Placeholder text for new elements (English by default). Applies to elements
   * created after a change; existing text is never rewritten.
   */
  labels?: Partial<WhiteboardLabels>;
  /**
   * How images are drawn and added (see `WhiteboardImages`). Image elements store the asset ID as
   * their `url`; without `resolveUrl` such images cannot be drawn. Without `upload` (an export
   * page, say) images can be drawn but not added, and pasted or dropped images are ignored.
   * Read on every use, so a new object each render is fine.
   */
  images?: WhiteboardImages;
  className?: string;
  style?: CSSProperties;
};

// The board only receives keyboard and clipboard events aimed inside this element (see the scope
// check in react-board/hooks/use-plugin-event). Put DOM focus here on a click, unless a field inside
// already has it, so it never stays on the page editor around the board.
const focusOnPointerDown = (event: PointerEvent<HTMLDivElement>) => {
  const scope = event.currentTarget;
  if (!scope.contains(document.activeElement)) scope.focus({ preventScroll: true });
};

export function WhiteboardCanvas({
  initialScene,
  readOnly = false,
  onSceneChange,
  onReady,
  onToolChange,
  onChange,
  labels,
  images,
  className,
  style,
}: WhiteboardCanvasProps): ReactElement {
  const boardRef = useRef<PlaitBoard | null>(null);
  const latestSceneRef = useRef<WhiteboardScene>(initialScene);
  const onSceneChangeRef = useRef(onSceneChange);
  onSceneChangeRef.current = onSceneChange;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onToolChangeRef = useRef(onToolChange);
  onToolChangeRef.current = onToolChange;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const labelsRef = useRef<WhiteboardLabels>({ ...DEFAULT_WHITEBOARD_LABELS, ...labels });
  labelsRef.current = { ...DEFAULT_WHITEBOARD_LABELS, ...labels };
  const imagesRef = useRef(images);
  imagesRef.current = images;
  // Plait reads its plugins once; they look the labels and image settings up through refs on every use.
  const plugins = useMemo(
    () =>
      createWhiteboardPlugins(
        () => labelsRef.current,
        () => imagesRef.current
      ),
    []
  );

  // `Wrapper` resets the board whenever `value` changes identity, so these must stay stable
  // between renders. They are recomputed only when `readOnly` flips, which also remounts the
  // Wrapper (keyed below) so the new board starts from the latest content, not the original.
  const seed = useMemo(() => {
    const scene = latestSceneRef.current;
    return {
      value: scene.children,
      viewport: scene.viewport ? ({ zoom: scene.viewport.zoom } as Viewport) : undefined,
      theme: {
        themeColorMode: (scene.theme?.themeColorMode ?? ThemeColorMode.default) as ThemeColorMode,
      } as PlaitTheme,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);
  const options = useMemo(() => createWhiteboardOptions(readOnly), [readOnly]);

  const capture = useCallback((emit: boolean) => {
    const board = boardRef.current;
    if (!board) return;
    const scene = sceneFromBoard(board);
    latestSceneRef.current = scene;
    if (emit) onSceneChangeRef.current?.(scene);
  }, []);

  const syncTool = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    onToolChangeRef.current?.(whiteboardToolFromBoard(board));
    onChangeRef.current?.(board);
  }, []);

  return (
    <div
      role="presentation"
      tabIndex={-1}
      data-whiteboard-scope=""
      style={{ width: "100%", height: "100%", outline: "none" }}
      onPointerDown={focusOnPointerDown}
      onKeyDown={guardNativeKeyDefaults}
    >
      <Wrapper
        key={readOnly ? "ro" : "rw"}
        value={seed.value}
        viewport={seed.viewport}
        theme={seed.theme}
        options={options}
        plugins={plugins}
        onValueChange={() => capture(true)}
        onThemeChange={() => capture(true)}
        onViewportChange={() => capture(false)}
        onChange={syncTool}
      >
        <Board
          className={className}
          style={style}
          afterInit={(board) => {
            boardRef.current = board;
            syncTool();
            onReadyRef.current?.(board);
          }}
        />
      </Wrapper>
    </div>
  );
}
