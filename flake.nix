{
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs =
    { self
    , nixpkgs
    , flake-utils
    ,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          # config = {allowUnfree = true;}; # questo ti serve se usi cose con licenza non OSS (e.g. jdk)
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_20
            corepack_20
            turbo
            nodePackages.rimraf
          ];
        };
      }
    );
}
