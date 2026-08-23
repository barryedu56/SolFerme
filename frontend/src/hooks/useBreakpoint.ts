import { useWindowDimensions } from 'react-native';

export const breakpoints = {
  tablet: 768,
  desktop: 1024,
};

export const useBreakpoint = () => {
  const { width } = useWindowDimensions();

  const isMobile = width < breakpoints.tablet;
  const isTablet = width >= breakpoints.tablet && width < breakpoints.desktop;
  const isDesktop = width >= breakpoints.desktop;

  return {
    width,
    isMobile,
    isTablet,
    isDesktop,
    isDesktopOrTablet: width >= breakpoints.tablet,
  };
};
