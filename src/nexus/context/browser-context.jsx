"use client";
import { throttle, debounce, get } from 'lodash';
import { useEffect, useState, useCallback, useRef, useContext } from 'react';
import { useAppContext } from "@/nexus/context/app-context";
import Show from '@/global/ui/components/show';

export const BrowserContextProvider = ({ children }) => {
	const [ready, setReady] = useState(false);
	const { state, events, updateState } = useAppContext();
	const s = useRef(state);


	const mainAreaResizeObserver = useRef(false);

	useEffect(() => {
		throttledGetDimensions()
		const handleResize = (event) => resize(event);
		const handleKeyDown = (event) => keyDown(event);
		const handleKeyUp = (event) => keyUp(event);
		const handleScroll = (event) => scroll(event);


		events.on("popoutStateViewer", ToggleStateViewPopout);
		events.on('RefsUpdated', RefsUpdated);
		events.on("preLogout", preLogout);
		events.on("headerResize", handleResize)

		window.addEventListener("resize", handleResize);
		window.addEventListener("orientationchange", handleResize);
		window.addEventListener('scroll', handleScroll)
		document.addEventListener('keydown', handleKeyDown);
		document.addEventListener('keyup', handleKeyUp);

		throttledGetDimensions();
		throttledSetScrollData();
		SetBrowser();

		setTimeout(() => {
			throttledGetDimensions()
			throttledSetScrollData();
			setTimeout(() => {
				queueMicrotask(() => {
					setReady(true);
				});
			}, 1)
		}, 0);

		return () => {
			window.removeEventListener("resize", handleResize);
			window.removeEventListener("orientationchange", handleResize);
			window.removeEventListener('scroll', handleScroll);
			document.removeEventListener('keydown', handleKeyDown);
			events.off("popoutStateViewer", ToggleStateViewPopout);
			events.off('RefsUpdated', RefsUpdated);
			events.off("preLogout", preLogout);
		};
	}, []);

	

	useEffect(() => {
		s.current = state;
		if (!mainAreaResizeObserver.current && s.current.refs?.fullAreaRef) {
			mainAreaResizeObserver.current = new ResizeObserver(() => {
				throttledGetDimensions();
				throttledSetScrollData();
				debouncedGetDimensions(false);
			});
			mainAreaResizeObserver.current.observe(s.current.refs.fullAreaRef);
		}
	}, [state.refs]);

	useEffect(() => {
		s.current = state;
	}, [state]);

	const RefsUpdated = () => {
		throttledGetDimensions();
		throttledSetScrollData();
	}

	const SetBrowser = () => {
		//set overflow-y scroll on html
		document.documentElement.style.overflowY = "scroll";
	}

	const preLogout = () => {
		setReady(false);
	}

	const ToggleStateViewPopout = () => {
		updateState((prevState) => {
			const updatedDeviceProperties = {
				...prevState.deviceProperties,
				popOutStateViewer: !prevState.deviceProperties.popOutStateViewer,
			};
			return { ...prevState, deviceProperties: updatedDeviceProperties };
		});
	}

	const resize = (event) => {
		throttledGetDimensions();
		debouncedGetDimensions();
		throttledSetScrollData(event);
		debouncedSetScrollData(event);
	}
	const scroll = useCallback((event) => {
		const scrollData = SetScrollData(event)
		events.emit('scroll', scrollData);
	}, []);


	const getDimensions = useCallback(() => {
		const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
		const orientation =
			window.innerHeight > window.innerWidth ? "portrait" : "landscape";
		let device = "desktop";

		if (/Mobile/.test(navigator.userAgent)) device = "mobile";
		else if (/Tablet/.test(navigator.userAgent)) device = "tablet";

		const screenSize = (() => {
			const width = window.innerWidth;
			if (width >= 1536) return "2xl";
			if (width >= 1280) return "xl";
			if (width >= 1024) return "lg";
			if (width >= 768) return "md";
			return "sm";
		})();

		const pwa = window.matchMedia("(display-mode: standalone)").matches;

		let deviceProperties = {
			screenSize,
			device,
			touch,
			orientation,
			pwa,
			small: (screenSize == "sm" || screenSize == "md")
		}

		if (s.current.refs?.sidebarRef && s.current.refs?.contentRef && s.current.refs?.fullAreaRef) {
			const mainContentRect = s.current.refs.contentRef.getBoundingClientRect();
			const fullAreaRect = s.current.refs.fullAreaRef.getBoundingClientRect();
			const win = window;
			deviceProperties.mainContentDimensions = {
				height: mainContentRect.height,
				width: mainContentRect.width,
				offsetLeft: mainContentRect.left,
				offsetRight: win.innerWidth - mainContentRect.right,
				offsetTop: mainContentRect.top,
				offsetBottom: win.innerHeight - mainContentRect.bottom,
			};


			deviceProperties.areaDimensions = {
				height: fullAreaRect.height,
				windowHeight: win.innerHeight - 16,
				width: fullAreaRect.width,
				offsetLeft: fullAreaRect.left,
				offsetRight: win.innerWidth - fullAreaRect.right,
				offsetTop: fullAreaRect.top,
				offsetBottom: win.innerHeight - fullAreaRect.bottom,
			};


			deviceProperties.windowDimensions = {
				width: win.innerWidth,
				height: win.innerHeight,
			};

		}

		updateState((prevState) => ({
			...prevState,
			deviceProperties: {
				...prevState.deviceProperties,
				...deviceProperties,
			}
		}));
		events.emit('resize');
	}, []);
	const throttledGetDimensions = useRef(throttle(getDimensions, 30)).current;
	const debouncedGetDimensions = useRef(debounce(getDimensions, 100)).current;


	const SetScrollData = useCallback((event, resize = true) => {

		const ss = s.current;
		const win = window;
		const windowHeight = win.innerHeight;

		const scrollTop = win.scrollY || document.documentElement.scrollTop;
		const maxScrollTop = document.documentElement.scrollHeight - windowHeight;

		const clampedScrollTop = Math.max(0, Math.min(scrollTop, maxScrollTop));

		const isAtTop = scrollTop <= 0;
		const isAtBottom = scrollTop >= maxScrollTop;

		const scrollShift = scrollTop > 8;
		const scrollHeight = document.documentElement.scrollHeight - windowHeight;
		const scrollPercentage = (scrollTop / scrollHeight) * 100;

		const screenSize = ss.deviceProperties.screenSize;

		let headerHeight = 0;
		let headerHeightTotal = 0;
		let headerBottomStatic = 0;
		let headerBottom = 0;
		let contentTopStatic = (ss.deviceProperties.small ? 64 : 8);
		let contentTop = ss.deviceProperties.small ? contentTopStatic : contentTopStatic - (scrollShift ? 8 : 0);

		if (s.current.refs?.headerRef && s.current.refs?.headerRef !== null) {
			const header = s.current.refs?.headerRef.getBoundingClientRect();
			headerHeight = header.height - 20;
			headerHeightTotal = header.height;
			headerBottomStatic = headerHeight + (ss.deviceProperties.small ? 84 : 28);
			headerBottom = ss.deviceProperties.small ? headerBottomStatic : headerBottomStatic - (scrollShift ? 8 : 0);
			contentTopStatic = headerBottomStatic + (ss.deviceProperties.small ? 12 : 20);
			contentTop = ss.deviceProperties.small ? contentTopStatic : contentTopStatic - (scrollShift ? 8 : 0);
		}

		const contentHeight = windowHeight - contentTop;
		const contentHeightStatic = windowHeight - contentTopStatic;

		const contentHeightMin = windowHeight - contentTop - 8;

		const scrollData = {
			headerHeight: headerHeight,
			headerHeightTotal: headerHeightTotal,
			headerBottomStatic: headerBottomStatic,
			headerBottom: headerBottom,
			contentTopStatic: contentTopStatic,
			contentTop: contentTop,
			contentHeight: contentHeight,
			contentHeightStatic: contentHeightStatic,
			contentHeightMin: contentHeightMin,
			scrollShift: scrollShift,
			scrollTop: scrollTop,
			clampedScrollTop: clampedScrollTop,
			scrollPercentage: parseInt(scrollPercentage) || 0,
			direction: event ? (event.deltaY > 0 ? 'd' : 'u') : "",
			deltaY: event ? event.deltaY : 0,
			diff: event ? Math.abs(event.deltaY) : 0,
			scrollHeight: document.documentElement.scrollHeight,
			isAtTop,
			isAtBottom,
			isElasticScrolling: (isAtTop && event?.deltaY < 0) || (isAtBottom && event?.deltaY > 0),
		};

		updateState((prevState) => ({
			...prevState,
			deviceProperties: {
				...prevState.deviceProperties,
				scrollData: {
					...prevState.deviceProperties.scrollData,
					...scrollData
				}
			}
		}));
		return scrollData;
	}, []);
	const throttledSetScrollData = useRef(throttle(SetScrollData, 1)).current;
	const debouncedSetScrollData = useRef(debounce(SetScrollData, 1)).current;

	const isTypingContext = () => {
		const el = document.activeElement;
		if (!el) return false;

		if (
			el.tagName === 'INPUT' ||
			el.tagName === 'TEXTAREA' ||
			el.tagName === 'SELECT'
		) {
			return true;
		}

		if (el.isContentEditable) {
			return true;
		}

		return false;
	};

	const keyDown = (event) => {
		if (event.key === 'Escape') {
			events.emit('esc', { e: event });
		} else if (event.key === 'Enter') {
			events.emit('enter', { e: event });
		} else if (event.key === 'Meta') {
			events.emit('meta', { e: event });
		} else if (event.key === '/') {
			if (!isTypingContext()) {
				events.emit('slash', { e: event });
			}
		} else if (event.key === 'ArrowUp') {
			events.emit('arrow-up', { e: event });
		} else if (event.key === 'ArrowDown') {
			events.emit('arrow-down', { e: event });
		} else if (event.key === 'Tab') {
			events.emit('tab', { e: event });
		}
	};
	const keyUp = (event) => {
		if (event.key === 'Escape') {
			events.emit('esc-off', { e: event });
		} else if (event.key === 'Enter') {
			events.emit('enter-off', { e: event });
		} else if (event.key === 'Meta') {
			events.emit('meta-off', { e: event });
		} else if (event.key === '/') {
			if (!isTypingContext()) {
				events.emit('slash-off', { e: event });
			}
		} else if (event.key === 'ArrowUp') {
			events.emit('arrow-up-off', { e: event });
		} else if (event.key === 'ArrowDown') {
			events.emit('arrow-down-off', { e: event });
		} else if (event.key === 'Tab') {
			events.emit('tab-off', { e: event });
		}
	};

	return (
		<Show show={ready}>
			{children}
		</Show>
	);
}