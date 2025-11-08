// lib/tmdb.ts

const API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;
const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/";

export type ImageSize = "w300" | "w500" | "original";

function buildUrl(
  endpoint: string,
  params: Record<string, string | number> = {}
) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.append("api_key", API_KEY ?? "");
  Object.entries(params).forEach(([key, val]) =>
    url.searchParams.append(key, String(val))
  );
  return url.toString();
}

export function getImageUrl(
  path: string | null | undefined,
  size: ImageSize = "w500"
): string | undefined {
  if (!path) return undefined;
  return `${IMAGE_BASE_URL}${size}${path}`;
}

// ----- APIs -----

export type TimeWindow = "day" | "week";

export async function fetchTrendingMovies(
  timeWindow: TimeWindow = "week",
  page = 1
): Promise<MovieResponse> {
  const res = await fetch(buildUrl(`/trending/movie/${timeWindow}`, { page }));
  if (!res.ok) throw new Error("Failed to fetch trending movies");
  return await res.json();
}

export async function fetchTrendingTVShows(
  timeWindow: TimeWindow = "week",
  page = 1
): Promise<TVResponse> {
  const res = await fetch(buildUrl(`/trending/tv/${timeWindow}`, { page }));
  if (!res.ok) throw new Error("Failed to fetch trending TV shows");
  return await res.json();
}

export async function fetchPopularMovies(page = 1): Promise<MovieResponse> {
  const res = await fetch(buildUrl("/movie/popular", { page }));
  if (!res.ok) throw new Error("Failed to fetch popular movies");
  return await res.json();
}

export async function fetchLatestMovie(): Promise<Movie> {
  const res = await fetch(buildUrl("/movie/latest"));
  if (!res.ok) throw new Error("Failed to fetch latest movie");
  return await res.json();
}

export async function fetchPopularTVShows(page = 1): Promise<TVResponse> {
  const res = await fetch(buildUrl("/tv/popular", { page }));
  if (!res.ok) throw new Error("Failed to fetch popular TV shows");
  return await res.json();
}

export async function fetchLatestTVShow(): Promise<TVShow> {
  const res = await fetch(buildUrl("/tv/latest"));
  if (!res.ok) throw new Error("Failed to fetch latest TV show");
  return await res.json();
}

export async function searchMulti(
  query: string,
  page = 1
): Promise<SearchResponse> {
  const res = await fetch(buildUrl("/search/multi", { query, page }));
  if (!res.ok) throw new Error("Failed to search movies and TV shows");
  return await res.json();
}

export async function fetchMovieDetails(
  movieId: number | string
): Promise<MovieDetails> {
  const res = await fetch(
    buildUrl(`/movie/${movieId}`, { append_to_response: "videos,credits" })
  );
  if (!res.ok) throw new Error("Failed to fetch movie details");
  return await res.json();
}

export async function fetchTVShowDetails(
  tvId: number | string
): Promise<TVShowDetails> {
  const res = await fetch(
    buildUrl(`/tv/${tvId}`, { append_to_response: "videos,credits" })
  );
  if (!res.ok) throw new Error("Failed to fetch TV show details");
  return await res.json();
}

export async function fetchSeasonDetails(
  tvId: number | string,
  seasonNumber: number | string
): Promise<SeasonDetails> {
  const res = await fetch(buildUrl(`/tv/${tvId}/season/${seasonNumber}`));
  if (!res.ok) throw new Error("Failed to fetch season details");
  return await res.json();
}

export async function fetchMovieGenres(): Promise<GenreResponse> {
  const res = await fetch(buildUrl("/genre/movie/list"));
  if (!res.ok) throw new Error("Failed to fetch movie genres");
  return await res.json();
}

export async function fetchTVGenres(): Promise<GenreResponse> {
  const res = await fetch(buildUrl("/genre/tv/list"));
  if (!res.ok) throw new Error("Failed to fetch TV genres");
  return await res.json();
}

// ----- External IDs (IMDB, etc.) -----

export async function fetchMovieExternalIds(
  movieId: number | string
): Promise<{ imdb_id: string | null } & Record<string, any>> {
  const res = await fetch(buildUrl(`/movie/${movieId}/external_ids`));
  if (!res.ok) throw new Error("Failed to fetch movie external ids");
  return await res.json();
}

export async function fetchTVEpisodeExternalIds(
  tvId: number | string,
  seasonNumber: number | string,
  episodeNumber: number | string
): Promise<{ imdb_id: string | null } & Record<string, any>> {
  const res = await fetch(
    buildUrl(
      `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}/external_ids`
    )
  );
  if (!res.ok) throw new Error("Failed to fetch TV episode external ids");
  return await res.json();
}

// ----- Types -----

export interface MovieResponse {
  page: number;
  results: Movie[];
  total_pages: number;
  total_results: number;
}

export interface TVResponse {
  page: number;
  results: TVShow[];
  total_pages: number;
  total_results: number;
}

export interface SearchResponse {
  page: number;
  results: (Movie | TVShow | Person)[];
  total_pages: number;
  total_results: number;
}

export interface GenreResponse {
  genres: Genre[];
}

export interface Genre {
  id: number;
  name: string;
}

export interface Movie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  popularity: number;
  adult: boolean;
  video: boolean;
}

export interface TVShow {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  first_air_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  popularity: number;
  origin_country: string[];
  original_language: string;
}

export interface Person {
  id: number;
  name: string;
  known_for_department: string;
  profile_path: string | null;
  popularity: number;
}

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at: string;
}

export interface Cast {
  cast_id: number;
  character: string;
  credit_id: string;
  gender: number | null;
  id: number;
  name: string;
  order: number;
  profile_path: string | null;
}

export interface Crew {
  credit_id: string;
  department: string;
  gender: number | null;
  id: number;
  job: string;
  name: string;
  profile_path: string | null;
}

export interface Credits {
  cast: Cast[];
  crew: Crew[];
}

export interface MovieDetails extends Movie {
  videos: {
    results: Video[];
  };
  credits: Credits;
  // The detailed movie endpoint returns full genre objects
  genres?: Genre[];
  // additional fields from detailed endpoint
  runtime?: number;
  status?: string;
  spoken_languages?: Array<{
    iso_639_1: string;
    name: string;
    english_name?: string;
  }>;
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  release_dates?: any;
}

export interface TVShowDetails extends TVShow {
  videos: {
    results: Video[];
  };
  credits: Credits;
  // Detailed TV endpoint returns seasons
  seasons?: Season[];
  genres?: Genre[];
  status?: string;
  episode_run_time?: number[];
  spoken_languages?: Array<{
    iso_639_1: string;
    name: string;
    english_name?: string;
  }>;
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
}

export interface Season {
  id: number;
  name: string;
  overview: string;
  air_date: string | null;
  poster_path: string | null;
  season_number: number;
  episode_count?: number;
}

export interface Episode {
  id: number;
  name: string;
  overview: string;
  air_date: string | null;
  episode_number: number;
  season_number: number;
  still_path: string | null;
}

export interface SeasonDetails {
  id: number;
  name: string;
  overview: string;
  air_date: string | null;
  season_number: number;
  episodes: Episode[];
  poster_path: string | null;
}

// Related/recommendations endpoints
export async function fetchRelatedMovies(
  movieId: number | string,
  page = 1
): Promise<MovieResponse> {
  const res = await fetch(
    buildUrl(`/movie/${movieId}/recommendations`, { page })
  );
  if (!res.ok) throw new Error("Failed to fetch related movies");
  return await res.json();
}

export async function fetchRelatedTVShows(
  tvId: number | string,
  page = 1
): Promise<TVResponse> {
  const res = await fetch(buildUrl(`/tv/${tvId}/recommendations`, { page }));
  if (!res.ok) throw new Error("Failed to fetch related TV shows");
  return await res.json();
}

/*
import {
  FileBasedStream,
  HlsBasedStream,
  makeProviders,
  makeStandardFetcher,
  ScrapeMedia,
  targets,
} from "@p-stream/providers";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

export default function Index() {
  const [stream, setStream] = useState<
    HlsBasedStream | FileBasedStream | undefined
  >(undefined);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      const providers = makeProviders({
        fetcher: makeStandardFetcher(fetch),
        target: targets.NATIVE,
        consistentIpForRequests: true,
      });
      // fetch some data from TMDB
      const media: ScrapeMedia = {
        type: "movie",
        title: "Hamilton",
        releaseYear: 2020,
        tmdbId: "556574",
      };
      const output = await providers.runAll({
        media: media,
      });
      if (isMounted) {
        setStream(output?.stream);
        console.log("Stream data:", output);
      }
    };
    fetchData();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <View className="flex-1 items-center justify-center">
      <Text className="text-xl font-bold text-blue-500">
        {stream && stream.type === "hls"
          ? (stream as HlsBasedStream).playlist
          : "Not an HLS stream"}
      </Text>
    </View>
  );
}

*/
